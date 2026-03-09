import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { listen } from '@tauri-apps/api/event';

// Mock state
const mockSetStatus = vi.fn();
const mockFlushBuffer = vi.fn();
const mockClearTranscripts = vi.fn();
const mockMarkMeetingAsSaved = vi.fn().mockResolvedValue(undefined);
const mockRefetchMeetings = vi.fn().mockResolvedValue(undefined);
const mockSetCurrentMeeting = vi.fn();
const mockSetMeetings = vi.fn();
const mockSetIsMeetingActive = vi.fn();
const mockRouterPush = vi.fn();
const mockTranscriptsRef = { current: [] as any[] };
const mockSaveMeeting = vi.fn();
const mockGetMeeting = vi.fn();
const mockGetTranscriptionStatus = vi.fn();

vi.mock('@/contexts/RecordingStateContext', () => ({
  useRecordingState: () => ({
    status: 'idle',
    setStatus: mockSetStatus,
    isStopping: false,
    isProcessing: false,
    isSaving: false,
  }),
  RecordingStatus: {
    IDLE: 'idle',
    STARTING: 'starting',
    RECORDING: 'recording',
    STOPPING: 'stopping',
    PROCESSING_TRANSCRIPTS: 'processing',
    SAVING: 'saving',
    COMPLETED: 'completed',
    ERROR: 'error',
  },
}));

vi.mock('@/contexts/TranscriptContext', () => ({
  useTranscripts: () => ({
    transcriptsRef: mockTranscriptsRef,
    flushBuffer: mockFlushBuffer,
    clearTranscripts: mockClearTranscripts,
    meetingTitle: 'Test Meeting',
    markMeetingAsSaved: mockMarkMeetingAsSaved,
  }),
}));

vi.mock('@/components/Sidebar/SidebarProvider', () => ({
  useSidebar: () => ({
    refetchMeetings: mockRefetchMeetings,
    setCurrentMeeting: mockSetCurrentMeeting,
    setMeetings: mockSetMeetings,
    meetings: [],
    setIsMeetingActive: mockSetIsMeetingActive,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    back: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@/services/storageService', () => ({
  storageService: {
    saveMeeting: (...args: any[]) => mockSaveMeeting(...args),
    getMeeting: (...args: any[]) => mockGetMeeting(...args),
  },
}));

vi.mock('@/services/transcriptService', () => ({
  transcriptService: {
    getTranscriptionStatus: () => mockGetTranscriptionStatus(),
  },
}));

vi.mock('@/lib/analytics', () => ({
  default: {
    trackButtonClick: vi.fn(),
    trackPageView: vi.fn(),
    trackMeetingCompleted: vi.fn().mockResolvedValue(undefined),
    updateMeetingCount: vi.fn().mockResolvedValue(undefined),
    getMeetingsCountToday: vi.fn().mockResolvedValue(1),
    calculateDaysSince: vi.fn().mockResolvedValue(0),
    track: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { useRecordingStop } from './useRecordingStop';

describe('useRecordingStop', () => {
  let setIsRecording: ReturnType<typeof vi.fn>;
  let setIsRecordingDisabled: ReturnType<typeof vi.fn>;
  let listenCallbacks: Record<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setIsRecording = vi.fn();
    setIsRecordingDisabled = vi.fn();
    listenCallbacks = {};

    mockTranscriptsRef.current = [
      { id: '1', text: 'Hello world', timestamp: '10:00:00', audio_start_time: 0, audio_end_time: 3 },
      { id: '2', text: 'Second segment', timestamp: '10:00:03', audio_start_time: 3, audio_end_time: 6 },
    ];

    // Mock transcription complete immediately
    mockGetTranscriptionStatus.mockResolvedValue({
      is_processing: false,
      chunks_in_queue: 0,
      last_activity_ms: 0,
    });

    mockSaveMeeting.mockResolvedValue({ meeting_id: 'meeting-123' });
    mockGetMeeting.mockResolvedValue({ id: 'meeting-123', title: 'Test Meeting' });

    // Capture listen callbacks
    vi.mocked(listen).mockImplementation(async (event: string, callback: any) => {
      listenCallbacks[event] = callback;
      return vi.fn(); // unlisten function
    });

    // Set up sessionStorage for folder_path
    sessionStorage.setItem('last_recording_folder_path', '/test/path');
    sessionStorage.setItem('last_recording_meeting_name', 'Test Meeting');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderStopHook = () =>
    renderHook(() => useRecordingStop(setIsRecording, setIsRecordingDisabled));

  // ── Initial state ─────────────────────────────────────────────────

  it('should return initial state correctly', () => {
    const { result } = renderStopHook();

    expect(result.current.isStopping).toBe(false);
    expect(result.current.isProcessingTranscript).toBe(false);
    expect(result.current.isSavingTranscript).toBe(false);
    expect(result.current.summaryStatus).toBe('idle');
  });

  it('should return handleRecordingStop as a function', () => {
    const { result } = renderStopHook();
    expect(typeof result.current.handleRecordingStop).toBe('function');
  });

  // ── Recording stop flow ───────────────────────────────────────────

  it('should set STOPPING status immediately on stop', async () => {
    const { result } = renderStopHook();

    await act(async () => {
      const stopPromise = result.current.handleRecordingStop(true);
      // Advance through all timers
      await vi.advanceTimersByTimeAsync(70000);
      await stopPromise;
    });

    expect(mockSetStatus).toHaveBeenCalledWith('stopping');
  });

  it('should set isRecording to false on stop', async () => {
    const { result } = renderStopHook();

    await act(async () => {
      const p = result.current.handleRecordingStop(true);
      await vi.advanceTimersByTimeAsync(70000);
      await p;
    });

    expect(setIsRecording).toHaveBeenCalledWith(false);
  });

  it('should disable recording during stop processing', async () => {
    const { result } = renderStopHook();

    await act(async () => {
      const p = result.current.handleRecordingStop(true);
      await vi.advanceTimersByTimeAsync(70000);
      await p;
    });

    expect(setIsRecordingDisabled).toHaveBeenCalledWith(true);
  });

  it('should flush transcript buffer after transcription completes', async () => {
    const { result } = renderStopHook();

    await act(async () => {
      const p = result.current.handleRecordingStop(true);
      await vi.advanceTimersByTimeAsync(70000);
      await p;
    });

    expect(mockFlushBuffer).toHaveBeenCalled();
  });

  it('should save meeting when callApi is true and transcription is complete', async () => {
    const { result } = renderStopHook();

    await act(async () => {
      const p = result.current.handleRecordingStop(true);
      await vi.advanceTimersByTimeAsync(70000);
      await p;
    });

    expect(mockSaveMeeting).toHaveBeenCalledWith(
      'Test Meeting',
      expect.any(Array),
      '/test/path'
    );
  });

  it('should not save meeting when callApi is false', async () => {
    const { result } = renderStopHook();

    await act(async () => {
      const p = result.current.handleRecordingStop(false);
      await vi.advanceTimersByTimeAsync(70000);
      await p;
    });

    expect(mockSaveMeeting).not.toHaveBeenCalled();
    expect(mockSetStatus).toHaveBeenCalledWith('idle');
  });

  it('should mark meeting as saved in IndexedDB after successful save', async () => {
    const { result } = renderStopHook();

    await act(async () => {
      const p = result.current.handleRecordingStop(true);
      await vi.advanceTimersByTimeAsync(70000);
      await p;
    });

    expect(mockMarkMeetingAsSaved).toHaveBeenCalled();
  });

  it('should clean up sessionStorage after save', async () => {
    const { result } = renderStopHook();

    await act(async () => {
      const p = result.current.handleRecordingStop(true);
      await vi.advanceTimersByTimeAsync(70000);
      await p;
    });

    expect(sessionStorage.getItem('last_recording_folder_path')).toBeNull();
    expect(sessionStorage.getItem('last_recording_meeting_name')).toBeNull();
  });

  it('should refetch meetings after save', async () => {
    const { result } = renderStopHook();

    await act(async () => {
      const p = result.current.handleRecordingStop(true);
      await vi.advanceTimersByTimeAsync(70000);
      await p;
    });

    expect(mockRefetchMeetings).toHaveBeenCalled();
  });

  it('should set current meeting after save', async () => {
    const { result } = renderStopHook();

    await act(async () => {
      const p = result.current.handleRecordingStop(true);
      await vi.advanceTimersByTimeAsync(70000);
      await p;
    });

    expect(mockSetCurrentMeeting).toHaveBeenCalledWith({
      id: 'meeting-123',
      title: 'Test Meeting',
    });
  });

  // ── Transcription polling ─────────────────────────────────────────

  it('should poll transcription status until complete', async () => {
    let callCount = 0;
    mockGetTranscriptionStatus.mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        return { is_processing: true, chunks_in_queue: 2, last_activity_ms: 100 };
      }
      return { is_processing: false, chunks_in_queue: 0, last_activity_ms: 0 };
    });

    const { result } = renderStopHook();

    await act(async () => {
      const p = result.current.handleRecordingStop(true);
      await vi.advanceTimersByTimeAsync(70000);
      await p;
    });

    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  it('should show remaining chunks in status message', async () => {
    let callCount = 0;
    mockGetTranscriptionStatus.mockImplementation(async () => {
      callCount++;
      if (callCount < 2) {
        return { is_processing: true, chunks_in_queue: 5, last_activity_ms: 100 };
      }
      return { is_processing: false, chunks_in_queue: 0, last_activity_ms: 0 };
    });

    const { result } = renderStopHook();

    await act(async () => {
      const p = result.current.handleRecordingStop(true);
      await vi.advanceTimersByTimeAsync(70000);
      await p;
    });

    expect(mockSetStatus).toHaveBeenCalledWith('processing', 'Processing 5 remaining chunks...');
  });

  it('should treat high last_activity_ms as complete', async () => {
    mockGetTranscriptionStatus.mockResolvedValue({
      is_processing: true,
      chunks_in_queue: 0,
      last_activity_ms: 9000,
    });

    const { result } = renderStopHook();

    await act(async () => {
      const p = result.current.handleRecordingStop(true);
      await vi.advanceTimersByTimeAsync(70000);
      await p;
    });

    // Should still proceed to save
    expect(mockSaveMeeting).toHaveBeenCalled();
  });

  // ── Duplicate stop guard ──────────────────────────────────────────

  it('should prevent concurrent stop calls', async () => {
    // Make the first stop take longer
    let resolveFirst: () => void;
    const firstStopPromise = new Promise<void>(r => { resolveFirst = r; });
    mockGetTranscriptionStatus
      .mockImplementationOnce(() => firstStopPromise.then(() => ({
        is_processing: false, chunks_in_queue: 0, last_activity_ms: 0
      })))
      .mockResolvedValue({
        is_processing: false, chunks_in_queue: 0, last_activity_ms: 0
      });

    const { result } = renderStopHook();

    let firstCall: Promise<void>;
    await act(async () => {
      firstCall = result.current.handleRecordingStop(true);
    });

    // Second call while first is in progress
    await act(async () => {
      result.current.handleRecordingStop(true);
    });

    // Only one setStatus('stopping') call
    const stoppingCalls = mockSetStatus.mock.calls.filter(
      (c: any[]) => c[0] === 'stopping'
    );
    expect(stoppingCalls.length).toBe(1);

    // Clean up
    resolveFirst!();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(70000);
    });
  });

  // ── Error handling ────────────────────────────────────────────────

  it('should handle save failure and set ERROR status', async () => {
    mockSaveMeeting.mockRejectedValueOnce(new Error('Database error'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderStopHook();

    // The outer try/catch in handleRecordingStop catches the save error internally,
    // so it does not propagate outside the function.
    await act(async () => {
      const p = result.current.handleRecordingStop(true);
      await vi.advanceTimersByTimeAsync(70000);
      await p;
    });

    expect(mockSetStatus).toHaveBeenCalledWith('error', 'Database error');
  });

  it('should re-enable recording on error', async () => {
    mockSaveMeeting.mockRejectedValueOnce(new Error('Save failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderStopHook();

    try {
      await act(async () => {
        const p = result.current.handleRecordingStop(true);
        await vi.advanceTimersByTimeAsync(70000);
        await p;
      });
    } catch {
      // Expected
    }

    expect(setIsRecordingDisabled).toHaveBeenCalledWith(false);
  });

  it('should handle missing meeting_id in save response', async () => {
    mockSaveMeeting.mockResolvedValueOnce({ meeting_id: undefined });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderStopHook();

    // The outer try/catch catches internally - error does not propagate
    await act(async () => {
      const p = result.current.handleRecordingStop(true);
      await vi.advanceTimersByTimeAsync(70000);
      await p;
    });

    expect(mockSetStatus).toHaveBeenCalledWith('error', 'No meeting ID received from save operation');
  });

  // ── Window exposure ───────────────────────────────────────────────

  it('should expose handleRecordingStop on window object', async () => {
    renderStopHook();
    // The useEffect that sets window.handleRecordingStop is synchronous,
    // but we need to wait for React effects to flush
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect((window as any).handleRecordingStop).toBeDefined();
    expect(typeof (window as any).handleRecordingStop).toBe('function');
  });

  it('should clean up window.handleRecordingStop on unmount', async () => {
    const { unmount } = renderStopHook();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    expect((window as any).handleRecordingStop).toBeUndefined();
  });

  // ── setIsStopping wrapper ─────────────────────────────────────────

  it('should set STOPPING status via setIsStopping(true)', async () => {
    const { result } = renderStopHook();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    result.current.setIsStopping(true);
    expect(mockSetStatus).toHaveBeenCalledWith('stopping');
  });

  it('should set IDLE status via setIsStopping(false)', async () => {
    const { result } = renderStopHook();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    result.current.setIsStopping(false);
    expect(mockSetStatus).toHaveBeenCalledWith('idle');
  });

  // ── recording-stopped listener ────────────────────────────────────

  it('should set up recording-stopped event listener', async () => {
    renderStopHook();
    // The listen call is inside an async function in useEffect, so we need to flush
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(listen).toHaveBeenCalledWith('recording-stopped', expect.any(Function));
  });

  it('should set meeting active to false after stop completes', async () => {
    const { result } = renderStopHook();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      const p = result.current.handleRecordingStop(false);
      await vi.advanceTimersByTimeAsync(70000);
      await p;
    });

    expect(mockSetIsMeetingActive).toHaveBeenCalledWith(false);
  });

  // ── summaryStatus derivation ──────────────────────────────────────

  it('should derive summaryStatus as idle from idle status', async () => {
    const { result } = renderStopHook();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.summaryStatus).toBe('idle');
  });
});
