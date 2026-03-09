import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mockIsRecording = vi.fn();

vi.mock('@/services/recordingService', () => ({
  recordingService: {
    isRecording: () => mockIsRecording(),
  },
}));

import { useRecordingStateSync } from './useRecordingStateSync';

describe('useRecordingStateSync', () => {
  let setIsRecording: ReturnType<typeof vi.fn>;
  let setIsMeetingActive: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setIsRecording = vi.fn();
    setIsMeetingActive = vi.fn();
    mockIsRecording.mockResolvedValue(false);

    // Set up Tauri availability
    (window as any).__TAURI__ = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).__TAURI__;
  });

  const renderSyncHook = (isRecording = false) =>
    renderHook(
      ({ isRec }) => useRecordingStateSync(isRec, setIsRecording, setIsMeetingActive),
      { initialProps: { isRec: isRecording } }
    );

  // ── Initial state ─────────────────────────────────────────────────

  it('should return initial isRecordingDisabled as false', () => {
    const { result } = renderSyncHook();
    expect(result.current.isRecordingDisabled).toBe(false);
  });

  it('should return isBackendRecording matching isRecording prop', () => {
    const { result } = renderSyncHook(true);
    expect(result.current.isBackendRecording).toBe(true);
  });

  it('should return setIsRecordingDisabled function', () => {
    const { result } = renderSyncHook();
    expect(typeof result.current.setIsRecordingDisabled).toBe('function');
  });

  // ── setIsRecordingDisabled ────────────────────────────────────────

  it('should update isRecordingDisabled when set', () => {
    const { result } = renderSyncHook();

    act(() => {
      result.current.setIsRecordingDisabled(true);
    });

    expect(result.current.isRecordingDisabled).toBe(true);
  });

  it('should toggle isRecordingDisabled', () => {
    const { result } = renderSyncHook();

    act(() => {
      result.current.setIsRecordingDisabled(true);
    });
    expect(result.current.isRecordingDisabled).toBe(true);

    act(() => {
      result.current.setIsRecordingDisabled(false);
    });
    expect(result.current.isRecordingDisabled).toBe(false);
  });

  // ── Backend state polling ─────────────────────────────────────────

  it('should check backend recording state immediately when Tauri is available', async () => {
    renderSyncHook(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockIsRecording).toHaveBeenCalled();
  });

  it('should poll backend every 1 second', async () => {
    renderSyncHook(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    // Initial call + 3 interval calls
    expect(mockIsRecording.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('should sync UI to true when backend is recording but UI is not', async () => {
    mockIsRecording.mockResolvedValue(true);

    renderSyncHook(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(setIsRecording).toHaveBeenCalledWith(true);
    expect(setIsMeetingActive).toHaveBeenCalledWith(true);
  });

  it('should sync UI to false when backend is not recording but UI is', async () => {
    mockIsRecording.mockResolvedValue(false);

    renderSyncHook(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(setIsRecording).toHaveBeenCalledWith(false);
  });

  it('should not update state when backend and UI agree (both recording)', async () => {
    mockIsRecording.mockResolvedValue(true);

    renderSyncHook(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // setIsRecording should not have been called since states match
    expect(setIsRecording).not.toHaveBeenCalled();
  });

  it('should not update state when backend and UI agree (both not recording)', async () => {
    mockIsRecording.mockResolvedValue(false);

    renderSyncHook(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(setIsRecording).not.toHaveBeenCalled();
  });

  // ── Tauri not available ───────────────────────────────────────────

  it('should not poll when Tauri is not available', async () => {
    delete (window as any).__TAURI__;

    renderSyncHook(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(mockIsRecording).not.toHaveBeenCalled();
  });

  // ── Error handling ────────────────────────────────────────────────

  it('should handle recording service errors gracefully', async () => {
    mockIsRecording.mockRejectedValue(new Error('Connection failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderSyncHook(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to check recording state:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it('should continue polling after errors', async () => {
    let callCount = 0;
    mockIsRecording.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('Temporary error');
      return false;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderSyncHook(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    // Should have attempted multiple calls despite first error
    expect(callCount).toBeGreaterThan(1);
    vi.mocked(console.error).mockRestore();
  });

  // ── Cleanup ───────────────────────────────────────────────────────

  it('should clean up interval on unmount', async () => {
    const { unmount } = renderSyncHook(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const callsBefore = mockIsRecording.mock.calls.length;
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    // No new calls after unmount
    expect(mockIsRecording.mock.calls.length).toBe(callsBefore);
  });

  it('should restart polling when isRecording prop changes', async () => {
    const { rerender } = renderSyncHook(false);
    mockIsRecording.mockResolvedValue(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const callsBefore = mockIsRecording.mock.calls.length;

    rerender({ isRec: true });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // Should have made additional calls after rerender
    expect(mockIsRecording.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
