import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { OllamaDownloadProvider, useOllamaDownload } from './OllamaDownloadContext';
import { listen } from '@tauri-apps/api/event';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <OllamaDownloadProvider>{children}</OllamaDownloadProvider>;
}

describe('OllamaDownloadContext', () => {
  // Store captured event callbacks
  const eventCallbacks: Record<string, (event: any) => void> = {};
  const mockUnlisten = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(eventCallbacks).forEach((k) => delete eventCallbacks[k]);

    vi.mocked(listen).mockImplementation(async (eventName: string, callback: any) => {
      eventCallbacks[eventName] = callback;
      return mockUnlisten;
    });
  });

  describe('useOllamaDownload outside provider', () => {
    it('throws when used outside provider', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => {
        renderHook(() => useOllamaDownload());
      }).toThrow('useOllamaDownload must be used within an OllamaDownloadProvider');
      spy.mockRestore();
    });
  });

  describe('initial state', () => {
    it('provides empty download state', async () => {
      const { result } = renderHook(() => useOllamaDownload(), { wrapper });

      expect(result.current.downloadProgress.size).toBe(0);
      expect(result.current.downloadingModels.size).toBe(0);
      expect(result.current.isDownloading('test-model')).toBe(false);
      expect(result.current.getProgress('test-model')).toBeUndefined();
    });
  });

  describe('event listener setup', () => {
    it('registers three event listeners on mount', async () => {
      renderHook(() => useOllamaDownload(), { wrapper });

      await waitFor(() => {
        expect(listen).toHaveBeenCalledWith('ollama-model-download-progress', expect.any(Function));
        expect(listen).toHaveBeenCalledWith('ollama-model-download-complete', expect.any(Function));
        expect(listen).toHaveBeenCalledWith('ollama-model-download-error', expect.any(Function));
      });
    });

    it('cleans up listeners on unmount', async () => {
      const { unmount } = renderHook(() => useOllamaDownload(), { wrapper });

      await waitFor(() => {
        expect(listen).toHaveBeenCalledTimes(3);
      });

      unmount();

      expect(mockUnlisten).toHaveBeenCalledTimes(3);
    });
  });

  describe('download progress events', () => {
    it('tracks progress for a model', async () => {
      const { result } = renderHook(() => useOllamaDownload(), { wrapper });

      await waitFor(() => {
        expect(eventCallbacks['ollama-model-download-progress']).toBeDefined();
      });

      act(() => {
        eventCallbacks['ollama-model-download-progress']({
          payload: { modelName: 'llama2', progress: 50 },
        });
      });

      expect(result.current.getProgress('llama2')).toBe(50);
      expect(result.current.isDownloading('llama2')).toBe(true);
    });

    it('updates progress incrementally', async () => {
      const { result } = renderHook(() => useOllamaDownload(), { wrapper });

      await waitFor(() => {
        expect(eventCallbacks['ollama-model-download-progress']).toBeDefined();
      });

      act(() => {
        eventCallbacks['ollama-model-download-progress']({
          payload: { modelName: 'llama2', progress: 25 },
        });
      });

      expect(result.current.getProgress('llama2')).toBe(25);

      act(() => {
        eventCallbacks['ollama-model-download-progress']({
          payload: { modelName: 'llama2', progress: 75 },
        });
      });

      expect(result.current.getProgress('llama2')).toBe(75);
    });

    it('tracks multiple models simultaneously', async () => {
      const { result } = renderHook(() => useOllamaDownload(), { wrapper });

      await waitFor(() => {
        expect(eventCallbacks['ollama-model-download-progress']).toBeDefined();
      });

      act(() => {
        eventCallbacks['ollama-model-download-progress']({
          payload: { modelName: 'llama2', progress: 30 },
        });
        eventCallbacks['ollama-model-download-progress']({
          payload: { modelName: 'gemma', progress: 60 },
        });
      });

      expect(result.current.isDownloading('llama2')).toBe(true);
      expect(result.current.isDownloading('gemma')).toBe(true);
      expect(result.current.getProgress('llama2')).toBe(30);
      expect(result.current.getProgress('gemma')).toBe(60);
    });
  });

  describe('download complete events', () => {
    it('clears progress and downloading state on complete', async () => {
      const { result } = renderHook(() => useOllamaDownload(), { wrapper });

      await waitFor(() => {
        expect(eventCallbacks['ollama-model-download-progress']).toBeDefined();
      });

      // First add progress
      act(() => {
        eventCallbacks['ollama-model-download-progress']({
          payload: { modelName: 'llama2', progress: 90 },
        });
      });

      expect(result.current.isDownloading('llama2')).toBe(true);

      // Then complete
      act(() => {
        eventCallbacks['ollama-model-download-complete']({
          payload: { modelName: 'llama2' },
        });
      });

      expect(result.current.isDownloading('llama2')).toBe(false);
      expect(result.current.getProgress('llama2')).toBeUndefined();
    });

    it('shows success toast on complete', async () => {
      const { toast } = await import('sonner');
      renderHook(() => useOllamaDownload(), { wrapper });

      await waitFor(() => {
        expect(eventCallbacks['ollama-model-download-complete']).toBeDefined();
      });

      act(() => {
        eventCallbacks['ollama-model-download-complete']({
          payload: { modelName: 'llama2' },
        });
      });

      expect(toast.success).toHaveBeenCalledWith('Model llama2 downloaded!', expect.any(Object));
    });
  });

  describe('download error events', () => {
    it('clears progress and downloading state on error', async () => {
      const { result } = renderHook(() => useOllamaDownload(), { wrapper });

      await waitFor(() => {
        expect(eventCallbacks['ollama-model-download-progress']).toBeDefined();
      });

      act(() => {
        eventCallbacks['ollama-model-download-progress']({
          payload: { modelName: 'llama2', progress: 45 },
        });
      });

      act(() => {
        eventCallbacks['ollama-model-download-error']({
          payload: { modelName: 'llama2', error: 'Network error' },
        });
      });

      expect(result.current.isDownloading('llama2')).toBe(false);
      expect(result.current.getProgress('llama2')).toBeUndefined();
    });

    it('shows error toast on download error', async () => {
      const { toast } = await import('sonner');
      renderHook(() => useOllamaDownload(), { wrapper });

      await waitFor(() => {
        expect(eventCallbacks['ollama-model-download-error']).toBeDefined();
      });

      act(() => {
        eventCallbacks['ollama-model-download-error']({
          payload: { modelName: 'llama2', error: 'Disk full' },
        });
      });

      expect(toast.error).toHaveBeenCalledWith('Download failed: llama2', expect.any(Object));
    });
  });
});
