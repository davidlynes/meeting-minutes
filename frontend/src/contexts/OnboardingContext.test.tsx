import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { OnboardingProvider, useOnboarding } from './OnboardingContext';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

function wrapper({ children }: { children: React.ReactNode }) {
  return <OnboardingProvider>{children}</OnboardingProvider>;
}

describe('OnboardingContext', () => {
  const eventCallbacks: Record<string, (event: any) => void> = {};
  const mockUnlisten = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(eventCallbacks).forEach((k) => delete eventCallbacks[k]);

    // Default invoke mock: resolve with sensible defaults
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      switch (cmd) {
        case 'get_onboarding_status':
          return null;
        case 'check_first_launch':
          return true; // first launch
        case 'initialize_fresh_database':
          return undefined;
        case 'builtin_ai_get_recommended_model':
          return 'gemma3:1b';
        case 'parakeet_init':
          return undefined;
        case 'parakeet_has_available_models':
          return false;
        case 'builtin_ai_get_available_summary_model':
          return null;
        case 'parakeet_get_available_models':
          return [];
        case 'save_onboarding_status_cmd':
          return undefined;
        case 'complete_onboarding':
          return undefined;
        case 'parakeet_download_model':
          return undefined;
        case 'builtin_ai_download_model':
          return undefined;
        case 'parakeet_retry_download':
          return undefined;
        default:
          return undefined;
      }
    });

    vi.mocked(listen).mockImplementation(async (eventName: string, callback: any) => {
      eventCallbacks[eventName] = callback;
      return mockUnlisten;
    });
  });

  describe('useOnboarding outside provider', () => {
    it('throws when used outside provider', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => {
        renderHook(() => useOnboarding());
      }).toThrow('useOnboarding must be used within OnboardingProvider');
      spy.mockRestore();
    });
  });

  describe('initial state', () => {
    it('provides default state values', async () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      expect(result.current.currentStep).toBe(1);
      expect(result.current.parakeetDownloaded).toBe(false);
      expect(result.current.parakeetProgress).toBe(0);
      expect(result.current.summaryModelDownloaded).toBe(false);
      expect(result.current.summaryModelProgress).toBe(0);
      expect(result.current.databaseExists).toBe(false);
      expect(result.current.isBackgroundDownloading).toBe(false);
      expect(result.current.permissionsSkipped).toBe(false);
    });

    it('provides default permissions state', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      expect(result.current.permissions.microphone).toBe('not_determined');
      expect(result.current.permissions.systemAudio).toBe('not_determined');
      expect(result.current.permissions.screenRecording).toBe('not_determined');
    });

    it('provides default parakeet progress info', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      expect(result.current.parakeetProgressInfo).toEqual({
        percent: 0,
        downloadedMb: 0,
        totalMb: 0,
        speedMbps: 0,
      });
    });

    it('has default selectedSummaryModel', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      // Initially gemma3:1b, but may change to recommended model async
      expect(typeof result.current.selectedSummaryModel).toBe('string');
    });
  });

  describe('step navigation', () => {
    it('goNext increments step', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      act(() => {
        result.current.goNext();
      });

      expect(result.current.currentStep).toBe(2);
    });

    it('goNext does not go beyond step 4', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      act(() => {
        result.current.goToStep(4);
      });

      act(() => {
        result.current.goNext();
      });

      expect(result.current.currentStep).toBe(4);
    });

    it('goPrevious decrements step', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      act(() => {
        result.current.goToStep(3);
      });

      act(() => {
        result.current.goPrevious();
      });

      expect(result.current.currentStep).toBe(2);
    });

    it('goPrevious does not go below step 1', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      act(() => {
        result.current.goPrevious();
      });

      expect(result.current.currentStep).toBe(1);
    });

    it('goToStep sets step within bounds', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      act(() => {
        result.current.goToStep(3);
      });

      expect(result.current.currentStep).toBe(3);
    });

    it('goToStep clamps to min 1', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      act(() => {
        result.current.goToStep(0);
      });

      expect(result.current.currentStep).toBe(1);
    });

    it('goToStep clamps to max 4', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      act(() => {
        result.current.goToStep(10);
      });

      expect(result.current.currentStep).toBe(4);
    });
  });

  describe('setters', () => {
    it('setParakeetDownloaded updates state', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      act(() => {
        result.current.setParakeetDownloaded(true);
      });

      expect(result.current.parakeetDownloaded).toBe(true);
    });

    it('setSummaryModelDownloaded updates state', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      act(() => {
        result.current.setSummaryModelDownloaded(true);
      });

      expect(result.current.summaryModelDownloaded).toBe(true);
    });

    it('setSelectedSummaryModel updates state', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      act(() => {
        result.current.setSelectedSummaryModel('gemma3:4b');
      });

      expect(result.current.selectedSummaryModel).toBe('gemma3:4b');
    });

    it('setDatabaseExists updates state', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      act(() => {
        result.current.setDatabaseExists(true);
      });

      expect(result.current.databaseExists).toBe(true);
    });

    it('setPermissionStatus updates specific permission', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      act(() => {
        result.current.setPermissionStatus('microphone', 'authorized');
      });

      expect(result.current.permissions.microphone).toBe('authorized');
      expect(result.current.permissions.systemAudio).toBe('not_determined');
    });

    it('setPermissionsSkipped updates state', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      act(() => {
        result.current.setPermissionsSkipped(true);
      });

      expect(result.current.permissionsSkipped).toBe(true);
    });
  });

  describe('completeOnboarding', () => {
    it('calls invoke with selected model', async () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      await act(async () => {
        await result.current.completeOnboarding();
      });

      expect(invoke).toHaveBeenCalledWith('complete_onboarding', {
        model: expect.any(String),
      });
    });

    it('throws on failure', async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'complete_onboarding') throw new Error('Failed');
        // Return defaults for other commands
        if (cmd === 'get_onboarding_status') return null;
        if (cmd === 'check_first_launch') return true;
        if (cmd === 'initialize_fresh_database') return undefined;
        if (cmd === 'builtin_ai_get_recommended_model') return 'gemma3:1b';
        if (cmd === 'parakeet_get_available_models') return [];
        return undefined;
      });

      const { result } = renderHook(() => useOnboarding(), { wrapper });

      await expect(
        act(async () => {
          await result.current.completeOnboarding();
        })
      ).rejects.toThrow('Failed');
    });
  });

  describe('mount initialization', () => {
    it('checks database status on mount', async () => {
      renderHook(() => useOnboarding(), { wrapper });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('check_first_launch');
      });
    });

    it('fetches recommended model on mount', async () => {
      renderHook(() => useOnboarding(), { wrapper });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('builtin_ai_get_recommended_model');
      });
    });

    it('loads onboarding status on mount', async () => {
      renderHook(() => useOnboarding(), { wrapper });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('get_onboarding_status');
      });
    });
  });

  describe('parakeet download events', () => {
    it('updates parakeet progress on download event', async () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      await waitFor(() => {
        expect(eventCallbacks['parakeet-model-download-progress']).toBeDefined();
      });

      act(() => {
        eventCallbacks['parakeet-model-download-progress']({
          payload: {
            modelName: 'parakeet-tdt-0.6b-v3-int8',
            progress: 42,
            downloaded_mb: 281,
            total_mb: 670,
            speed_mbps: 15,
          },
        });
      });

      expect(result.current.parakeetProgress).toBe(42);
      expect(result.current.parakeetProgressInfo.downloadedMb).toBe(281);
      expect(result.current.parakeetProgressInfo.totalMb).toBe(670);
      expect(result.current.parakeetProgressInfo.speedMbps).toBe(15);
    });

    it('marks parakeet as downloaded on completion status', async () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      await waitFor(() => {
        expect(eventCallbacks['parakeet-model-download-progress']).toBeDefined();
      });

      act(() => {
        eventCallbacks['parakeet-model-download-progress']({
          payload: {
            modelName: 'parakeet-tdt-0.6b-v3-int8',
            progress: 100,
            status: 'completed',
          },
        });
      });

      expect(result.current.parakeetDownloaded).toBe(true);
    });

    it('marks parakeet as downloaded on complete event', async () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      await waitFor(() => {
        expect(eventCallbacks['parakeet-model-download-complete']).toBeDefined();
      });

      act(() => {
        eventCallbacks['parakeet-model-download-complete']({
          payload: { modelName: 'parakeet-tdt-0.6b-v3-int8' },
        });
      });

      expect(result.current.parakeetDownloaded).toBe(true);
      expect(result.current.parakeetProgress).toBe(100);
    });

    it('ignores events for non-matching model names', async () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      await waitFor(() => {
        expect(eventCallbacks['parakeet-model-download-progress']).toBeDefined();
      });

      act(() => {
        eventCallbacks['parakeet-model-download-progress']({
          payload: {
            modelName: 'other-model',
            progress: 80,
          },
        });
      });

      expect(result.current.parakeetProgress).toBe(0);
    });
  });

  describe('summary model download events', () => {
    it('updates summary model progress', async () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      await waitFor(() => {
        expect(eventCallbacks['builtin-ai-download-progress']).toBeDefined();
      });

      act(() => {
        eventCallbacks['builtin-ai-download-progress']({
          payload: {
            model: 'gemma3:1b',
            progress: 55,
            downloaded_mb: 500,
            total_mb: 900,
            speed_mbps: 20,
            status: 'downloading',
          },
        });
      });

      expect(result.current.summaryModelProgress).toBe(55);
      expect(result.current.summaryModelProgressInfo.downloadedMb).toBe(500);
    });

    it('marks summary model as downloaded on completion', async () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      await waitFor(() => {
        expect(eventCallbacks['builtin-ai-download-progress']).toBeDefined();
      });

      act(() => {
        eventCallbacks['builtin-ai-download-progress']({
          payload: {
            model: 'gemma3:1b',
            progress: 100,
            status: 'completed',
          },
        });
      });

      expect(result.current.summaryModelDownloaded).toBe(true);
    });
  });

  describe('startBackgroundDownloads', () => {
    it('starts parakeet download if not downloaded', async () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      await act(async () => {
        await result.current.startBackgroundDownloads(false);
      });

      expect(invoke).toHaveBeenCalledWith('parakeet_download_model', {
        modelName: 'parakeet-tdt-0.6b-v3-int8',
      });
      expect(result.current.isBackgroundDownloading).toBe(true);
    });
  });

  describe('retryParakeetDownload', () => {
    it('invokes parakeet retry command', async () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      await act(async () => {
        await result.current.retryParakeetDownload();
      });

      expect(invoke).toHaveBeenCalledWith('parakeet_retry_download', {
        modelName: 'parakeet-tdt-0.6b-v3-int8',
      });
    });

    it('throws on retry failure', async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'parakeet_retry_download') throw new Error('Retry failed');
        if (cmd === 'get_onboarding_status') return null;
        if (cmd === 'check_first_launch') return true;
        if (cmd === 'initialize_fresh_database') return undefined;
        if (cmd === 'builtin_ai_get_recommended_model') return 'gemma3:1b';
        if (cmd === 'parakeet_get_available_models') return [];
        return undefined;
      });

      const { result } = renderHook(() => useOnboarding(), { wrapper });

      await expect(
        act(async () => {
          await result.current.retryParakeetDownload();
        })
      ).rejects.toThrow('Retry failed');
    });
  });
});
