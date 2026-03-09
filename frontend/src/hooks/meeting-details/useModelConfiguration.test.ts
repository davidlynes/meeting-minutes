import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useModelConfiguration } from './useModelConfiguration';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/analytics', () => ({
  default: {
    trackModelChanged: vi.fn().mockResolvedValue(undefined),
    trackSettingsChanged: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('useModelConfiguration', () => {
  const eventCallbacks: Record<string, (event: any) => void> = {};
  const mockUnlisten = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(eventCallbacks).forEach((k) => delete eventCallbacks[k]);

    vi.mocked(listen).mockImplementation(async (eventName: string, callback: any) => {
      eventCallbacks[eventName] = callback;
      return mockUnlisten;
    });

    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'api_get_model_config') {
        return {
          provider: 'ollama',
          model: 'gemma3:1b',
          whisperModel: 'large-v3',
        };
      }
      if (cmd === 'api_save_model_config') return undefined;
      return undefined;
    });
  });

  it('fetches model config on mount', async () => {
    const { result } = renderHook(() =>
      useModelConfiguration({ serverAddress: 'http://localhost:5167' })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(invoke).toHaveBeenCalledWith('api_get_model_config', {});
    expect(result.current.modelConfig.provider).toBe('ollama');
    expect(result.current.modelConfig.model).toBe('gemma3:1b');
  });

  it('provides default empty config initially', () => {
    const { result } = renderHook(() =>
      useModelConfiguration({ serverAddress: null })
    );

    expect(result.current.modelConfig.provider).toBe('ollama');
    expect(result.current.modelConfig.model).toBe('');
    expect(result.current.isLoading).toBe(true);
  });

  it('listens for model-config-updated events', async () => {
    renderHook(() =>
      useModelConfiguration({ serverAddress: null })
    );

    await waitFor(() => {
      expect(listen).toHaveBeenCalledWith('model-config-updated', expect.any(Function));
    });
  });

  it('updates config when model-config-updated event fires', async () => {
    const { result } = renderHook(() =>
      useModelConfiguration({ serverAddress: null })
    );

    await waitFor(() => {
      expect(eventCallbacks['model-config-updated']).toBeDefined();
    });

    act(() => {
      eventCallbacks['model-config-updated']({
        payload: { provider: 'claude', model: 'claude-3', whisperModel: 'small' },
      });
    });

    expect(result.current.modelConfig.provider).toBe('claude');
    expect(result.current.modelConfig.model).toBe('claude-3');
  });

  describe('handleSaveModelConfig', () => {
    it('saves current config and emits event', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      vi.mocked(emit).mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useModelConfiguration({ serverAddress: null })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const { toast } = await import('sonner');

      await act(async () => {
        await result.current.handleSaveModelConfig();
      });

      expect(invoke).toHaveBeenCalledWith('api_save_model_config', expect.objectContaining({
        provider: expect.any(String),
        model: expect.any(String),
      }));
      expect(toast.success).toHaveBeenCalledWith('Summary settings Saved successfully');
    });

    it('saves updated config when provided', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      vi.mocked(emit).mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useModelConfiguration({ serverAddress: null })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const updatedConfig = {
        provider: 'groq',
        model: 'llama3',
        whisperModel: 'medium',
      };

      await act(async () => {
        await result.current.handleSaveModelConfig(updatedConfig);
      });

      expect(invoke).toHaveBeenCalledWith('api_save_model_config', expect.objectContaining({
        provider: 'groq',
        model: 'llama3',
      }));
    });

    it('shows error toast on save failure', async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'api_get_model_config') return { provider: 'ollama', model: 'x', whisperModel: 'y' };
        if (cmd === 'api_save_model_config') throw new Error('Save failed');
        return undefined;
      });

      const { result } = renderHook(() =>
        useModelConfiguration({ serverAddress: null })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const { toast } = await import('sonner');

      await act(async () => {
        await result.current.handleSaveModelConfig();
      });

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to save summary settings',
        expect.any(Object)
      );
    });
  });

  it('setModelConfig updates config directly', async () => {
    const { result } = renderHook(() =>
      useModelConfiguration({ serverAddress: null })
    );

    act(() => {
      result.current.setModelConfig({
        provider: 'openrouter',
        model: 'gpt-4',
        whisperModel: 'tiny',
      });
    });

    expect(result.current.modelConfig.provider).toBe('openrouter');
  });
});
