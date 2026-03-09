import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { listen } from '@tauri-apps/api/event';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock TranscriptSettings (may not exist on all branches)
vi.mock('@/components/TranscriptSettings', () => ({
  TranscriptModelProps: {},
}));

// Mock UpdateNotification (may not exist on all branches)
vi.mock('@/components/UpdateNotification', () => ({
  showUpdateNotification: vi.fn(),
}));

import { useModalState, type ModalType } from './useModalState';
import { toast } from 'sonner';

describe('useModalState', () => {
  let listenMock: Mock;
  let listenCallbacks: Record<string, (event: any) => void>;

  beforeEach(() => {
    listenCallbacks = {};
    listenMock = listen as Mock;
    listenMock.mockImplementation((eventName: string, callback: (event: any) => void) => {
      listenCallbacks[eventName] = callback;
      return Promise.resolve(vi.fn()); // returns unlisten function
    });
  });

  // ── Initial State ──────────────────────────────────────────────────

  it('should initialize all modals as closed', () => {
    const { result } = renderHook(() => useModalState());

    expect(result.current.modals.modelSettings).toBe(false);
    expect(result.current.modals.deviceSettings).toBe(false);
    expect(result.current.modals.languageSettings).toBe(false);
    expect(result.current.modals.modelSelector).toBe(false);
    expect(result.current.modals.errorAlert).toBe(false);
    expect(result.current.modals.chunkDropWarning).toBe(false);
  });

  it('should initialize all messages as empty strings', () => {
    const { result } = renderHook(() => useModalState());

    expect(result.current.messages.errorAlert).toBe('');
    expect(result.current.messages.chunkDropWarning).toBe('');
    expect(result.current.messages.modelSelector).toBe('');
  });

  // ── showModal ──────────────────────────────────────────────────────

  it('should open a modal by name', () => {
    const { result } = renderHook(() => useModalState());

    act(() => {
      result.current.showModal('modelSettings');
    });

    expect(result.current.modals.modelSettings).toBe(true);
  });

  it('should open errorAlert with a message', () => {
    const { result } = renderHook(() => useModalState());

    act(() => {
      result.current.showModal('errorAlert', 'Something went wrong');
    });

    expect(result.current.modals.errorAlert).toBe(true);
    expect(result.current.messages.errorAlert).toBe('Something went wrong');
  });

  it('should open chunkDropWarning with a message', () => {
    const { result } = renderHook(() => useModalState());

    act(() => {
      result.current.showModal('chunkDropWarning', 'Chunks dropped');
    });

    expect(result.current.modals.chunkDropWarning).toBe(true);
    expect(result.current.messages.chunkDropWarning).toBe('Chunks dropped');
  });

  it('should open modelSelector with a message', () => {
    const { result } = renderHook(() => useModalState());

    act(() => {
      result.current.showModal('modelSelector', 'Select a model');
    });

    expect(result.current.modals.modelSelector).toBe(true);
    expect(result.current.messages.modelSelector).toBe('Select a model');
  });

  it('should not set a message for non-message modals', () => {
    const { result } = renderHook(() => useModalState());

    act(() => {
      result.current.showModal('deviceSettings', 'should be ignored');
    });

    expect(result.current.modals.deviceSettings).toBe(true);
    // messages should remain unchanged
    expect(result.current.messages.errorAlert).toBe('');
    expect(result.current.messages.chunkDropWarning).toBe('');
    expect(result.current.messages.modelSelector).toBe('');
  });

  it('should allow multiple modals to be open simultaneously', () => {
    const { result } = renderHook(() => useModalState());

    act(() => {
      result.current.showModal('modelSettings');
      result.current.showModal('deviceSettings');
    });

    expect(result.current.modals.modelSettings).toBe(true);
    expect(result.current.modals.deviceSettings).toBe(true);
  });

  // ── hideModal ──────────────────────────────────────────────────────

  it('should close a modal by name', () => {
    const { result } = renderHook(() => useModalState());

    act(() => {
      result.current.showModal('modelSettings');
    });
    expect(result.current.modals.modelSettings).toBe(true);

    act(() => {
      result.current.hideModal('modelSettings');
    });
    expect(result.current.modals.modelSettings).toBe(false);
  });

  it('should clear the message when closing errorAlert', () => {
    const { result } = renderHook(() => useModalState());

    act(() => {
      result.current.showModal('errorAlert', 'Error!');
    });
    expect(result.current.messages.errorAlert).toBe('Error!');

    act(() => {
      result.current.hideModal('errorAlert');
    });
    expect(result.current.modals.errorAlert).toBe(false);
    expect(result.current.messages.errorAlert).toBe('');
  });

  it('should clear the message when closing chunkDropWarning', () => {
    const { result } = renderHook(() => useModalState());

    act(() => {
      result.current.showModal('chunkDropWarning', 'Dropped!');
    });

    act(() => {
      result.current.hideModal('chunkDropWarning');
    });
    expect(result.current.messages.chunkDropWarning).toBe('');
  });

  it('should clear the message when closing modelSelector', () => {
    const { result } = renderHook(() => useModalState());

    act(() => {
      result.current.showModal('modelSelector', 'Pick one');
    });

    act(() => {
      result.current.hideModal('modelSelector');
    });
    expect(result.current.messages.modelSelector).toBe('');
  });

  it('should not affect other modals when closing one', () => {
    const { result } = renderHook(() => useModalState());

    act(() => {
      result.current.showModal('modelSettings');
      result.current.showModal('deviceSettings');
    });

    act(() => {
      result.current.hideModal('modelSettings');
    });

    expect(result.current.modals.modelSettings).toBe(false);
    expect(result.current.modals.deviceSettings).toBe(true);
  });

  // ── hideAllModals ──────────────────────────────────────────────────

  it('should close all modals', () => {
    const { result } = renderHook(() => useModalState());

    act(() => {
      result.current.showModal('modelSettings');
      result.current.showModal('deviceSettings');
      result.current.showModal('errorAlert', 'Error!');
    });

    act(() => {
      result.current.hideAllModals();
    });

    expect(result.current.modals.modelSettings).toBe(false);
    expect(result.current.modals.deviceSettings).toBe(false);
    expect(result.current.modals.errorAlert).toBe(false);
  });

  it('should clear all messages when hiding all modals', () => {
    const { result } = renderHook(() => useModalState());

    act(() => {
      result.current.showModal('errorAlert', 'Error!');
      result.current.showModal('chunkDropWarning', 'Dropped!');
      result.current.showModal('modelSelector', 'Pick one');
    });

    act(() => {
      result.current.hideAllModals();
    });

    expect(result.current.messages.errorAlert).toBe('');
    expect(result.current.messages.chunkDropWarning).toBe('');
    expect(result.current.messages.modelSelector).toBe('');
  });

  // ── Event Listeners ────────────────────────────────────────────────

  it('should register chunk-drop-warning listener on mount', async () => {
    renderHook(() => useModalState());

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalledWith('chunk-drop-warning', expect.any(Function));
    });
  });

  it('should register transcription-error listener on mount', async () => {
    renderHook(() => useModalState());

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalledWith('transcription-error', expect.any(Function));
    });
  });

  it('should register model-download-complete listener on mount', async () => {
    renderHook(() => useModalState());

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalledWith('model-download-complete', expect.any(Function));
    });
  });

  it('should show chunkDropWarning modal when chunk-drop-warning event fires', async () => {
    const { result } = renderHook(() => useModalState());

    await waitFor(() => {
      expect(listenCallbacks['chunk-drop-warning']).toBeDefined();
    });

    act(() => {
      listenCallbacks['chunk-drop-warning']({ payload: 'Audio chunks dropped!' });
    });

    expect(result.current.modals.chunkDropWarning).toBe(true);
    expect(result.current.messages.chunkDropWarning).toBe('Audio chunks dropped!');
  });

  it('should show modelSelector modal for actionable transcription errors', async () => {
    const { result } = renderHook(() => useModalState());

    await waitFor(() => {
      expect(listenCallbacks['transcription-error']).toBeDefined();
    });

    act(() => {
      listenCallbacks['transcription-error']({
        payload: {
          error: 'model not found',
          userMessage: 'Model not loaded',
          actionable: true,
        },
      });
    });

    expect(result.current.modals.modelSelector).toBe(true);
    expect(result.current.messages.modelSelector).toBe('Model not loaded');
  });

  it('should show toast for non-actionable transcription errors', async () => {
    renderHook(() => useModalState());

    await waitFor(() => {
      expect(listenCallbacks['transcription-error']).toBeDefined();
    });

    act(() => {
      listenCallbacks['transcription-error']({
        payload: {
          error: 'timeout',
          userMessage: 'Transcription timed out',
          actionable: false,
        },
      });
    });

    expect(toast.error).toHaveBeenCalledWith('', expect.objectContaining({
      description: 'Transcription timed out',
      duration: 5000,
    }));
  });

  // ── Cleanup ────────────────────────────────────────────────────────

  it('should call unlisten functions on unmount', async () => {
    const unlistenFn = vi.fn();
    listenMock.mockResolvedValue(unlistenFn);

    const { unmount } = renderHook(() => useModalState());

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalled();
    });

    unmount();

    // Each effect registers a listener; unlisten should be called for each
    expect(unlistenFn).toHaveBeenCalled();
  });
});
