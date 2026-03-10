import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import {
  RecordingStateProvider,
  useRecordingState,
  RecordingStatus,
} from './RecordingStateContext';
import { recordingService } from '@/services/recordingService';

// Mock the recording service
vi.mock('@/services/recordingService', () => {
  const unlistenFn = vi.fn();
  return {
    recordingService: {
      getRecordingState: vi.fn().mockResolvedValue({
        is_recording: false,
        is_paused: false,
        is_active: false,
        recording_duration: null,
        active_duration: null,
      }),
      onRecordingStarted: vi.fn().mockResolvedValue(unlistenFn),
      onRecordingStopped: vi.fn().mockResolvedValue(unlistenFn),
      onRecordingPaused: vi.fn().mockResolvedValue(unlistenFn),
      onRecordingResumed: vi.fn().mockResolvedValue(unlistenFn),
    },
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <RecordingStateProvider>{children}</RecordingStateProvider>;
}

describe('RecordingStateContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('useRecordingState outside provider', () => {
    it('throws when used outside provider', () => {
      // Suppress console.error for expected error
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => {
        renderHook(() => useRecordingState());
      }).toThrow('useRecordingState must be used within a RecordingStateProvider');
      spy.mockRestore();
    });
  });

  describe('initial state', () => {
    it('provides default idle state', async () => {
      const { result } = renderHook(() => useRecordingState(), { wrapper });

      expect(result.current.isRecording).toBe(false);
      expect(result.current.isPaused).toBe(false);
      expect(result.current.isActive).toBe(false);
      expect(result.current.recordingDuration).toBeNull();
      expect(result.current.activeDuration).toBeNull();
      expect(result.current.status).toBe(RecordingStatus.IDLE);
      expect(result.current.statusMessage).toBeUndefined();
    });

    it('provides computed helpers as false initially', () => {
      const { result } = renderHook(() => useRecordingState(), { wrapper });

      expect(result.current.isStopping).toBe(false);
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.isSaving).toBe(false);
    });
  });

  describe('setStatus', () => {
    it('updates status and message', () => {
      const { result } = renderHook(() => useRecordingState(), { wrapper });

      act(() => {
        result.current.setStatus(RecordingStatus.RECORDING, 'Recording in progress');
      });

      expect(result.current.status).toBe(RecordingStatus.RECORDING);
      expect(result.current.statusMessage).toBe('Recording in progress');
    });

    it('skips update when status and message are the same', () => {
      const { result } = renderHook(() => useRecordingState(), { wrapper });

      act(() => {
        result.current.setStatus(RecordingStatus.RECORDING);
      });

      const prevStatus = result.current.status;

      // Set same status again
      act(() => {
        result.current.setStatus(RecordingStatus.RECORDING);
      });

      expect(result.current.status).toBe(prevStatus);
    });

    it('updates isStopping when set to STOPPING', () => {
      const { result } = renderHook(() => useRecordingState(), { wrapper });

      act(() => {
        result.current.setStatus(RecordingStatus.STOPPING);
      });

      expect(result.current.isStopping).toBe(true);
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.isSaving).toBe(false);
    });

    it('updates isProcessing when set to PROCESSING_TRANSCRIPTS', () => {
      const { result } = renderHook(() => useRecordingState(), { wrapper });

      act(() => {
        result.current.setStatus(RecordingStatus.PROCESSING_TRANSCRIPTS);
      });

      expect(result.current.isProcessing).toBe(true);
      expect(result.current.isStopping).toBe(false);
    });

    it('updates isSaving when set to SAVING', () => {
      const { result } = renderHook(() => useRecordingState(), { wrapper });

      act(() => {
        result.current.setStatus(RecordingStatus.SAVING);
      });

      expect(result.current.isSaving).toBe(true);
    });
  });

  describe('initial sync with backend', () => {
    it('calls getRecordingState on mount', async () => {
      renderHook(() => useRecordingState(), { wrapper });

      await waitFor(() => {
        expect(recordingService.getRecordingState).toHaveBeenCalled();
      });
    });

    it('syncs state when backend reports recording in progress', async () => {
      vi.mocked(recordingService.getRecordingState).mockResolvedValueOnce({
        is_recording: true,
        is_paused: false,
        is_active: true,
        recording_duration: 120,
        active_duration: 100,
      });

      const { result } = renderHook(() => useRecordingState(), { wrapper });

      await waitFor(() => {
        expect(result.current.isRecording).toBe(true);
        expect(result.current.isActive).toBe(true);
        expect(result.current.recordingDuration).toBe(120);
        expect(result.current.activeDuration).toBe(100);
      });
    });

    it('keeps current state on backend sync error', async () => {
      vi.mocked(recordingService.getRecordingState).mockRejectedValueOnce(
        new Error('connection failed')
      );

      const { result } = renderHook(() => useRecordingState(), { wrapper });

      await waitFor(() => {
        expect(result.current.isRecording).toBe(false);
        expect(result.current.status).toBe(RecordingStatus.IDLE);
      });
    });
  });

  describe('event handling', () => {
    it('sets up all four event listeners', async () => {
      renderHook(() => useRecordingState(), { wrapper });

      await waitFor(() => {
        expect(recordingService.onRecordingStarted).toHaveBeenCalled();
        expect(recordingService.onRecordingStopped).toHaveBeenCalled();
        expect(recordingService.onRecordingPaused).toHaveBeenCalled();
        expect(recordingService.onRecordingResumed).toHaveBeenCalled();
      });
    });

    it('updates state on recording-started event', async () => {
      let startedCallback: () => void = () => {};
      vi.mocked(recordingService.onRecordingStarted).mockImplementation(async (cb) => {
        startedCallback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useRecordingState(), { wrapper });

      await waitFor(() => {
        expect(recordingService.onRecordingStarted).toHaveBeenCalled();
      });

      act(() => {
        startedCallback();
      });

      expect(result.current.isRecording).toBe(true);
      expect(result.current.isPaused).toBe(false);
      expect(result.current.isActive).toBe(true);
      expect(result.current.status).toBe(RecordingStatus.RECORDING);
    });

    it('updates state on recording-stopped event', async () => {
      let stoppedCallback: (payload: any) => void = () => {};
      vi.mocked(recordingService.onRecordingStopped).mockImplementation(async (cb) => {
        stoppedCallback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useRecordingState(), { wrapper });

      await waitFor(() => {
        expect(recordingService.onRecordingStopped).toHaveBeenCalled();
      });

      act(() => {
        stoppedCallback({ message: 'stopped' });
      });

      expect(result.current.isRecording).toBe(false);
      expect(result.current.isPaused).toBe(false);
      expect(result.current.isActive).toBe(false);
      expect(result.current.recordingDuration).toBeNull();
      expect(result.current.status).toBe(RecordingStatus.STOPPING);
    });

    it('preserves stop-flow status if already in STOPPING', async () => {
      let stoppedCallback: (payload: any) => void = () => {};
      vi.mocked(recordingService.onRecordingStopped).mockImplementation(async (cb) => {
        stoppedCallback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useRecordingState(), { wrapper });

      await waitFor(() => {
        expect(recordingService.onRecordingStopped).toHaveBeenCalled();
      });

      // Set to PROCESSING first (part of stop flow)
      act(() => {
        result.current.setStatus(RecordingStatus.PROCESSING_TRANSCRIPTS);
      });

      act(() => {
        stoppedCallback({ message: 'stopped' });
      });

      // Should keep PROCESSING_TRANSCRIPTS, not overwrite to STOPPING
      expect(result.current.status).toBe(RecordingStatus.PROCESSING_TRANSCRIPTS);
    });

    it('updates state on recording-paused event', async () => {
      let pausedCallback: () => void = () => {};
      vi.mocked(recordingService.onRecordingPaused).mockImplementation(async (cb) => {
        pausedCallback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useRecordingState(), { wrapper });

      await waitFor(() => {
        expect(recordingService.onRecordingPaused).toHaveBeenCalled();
      });

      act(() => {
        pausedCallback();
      });

      expect(result.current.isPaused).toBe(true);
      expect(result.current.isActive).toBe(false);
    });

    it('updates state on recording-resumed event', async () => {
      let resumedCallback: () => void = () => {};
      vi.mocked(recordingService.onRecordingResumed).mockImplementation(async (cb) => {
        resumedCallback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useRecordingState(), { wrapper });

      await waitFor(() => {
        expect(recordingService.onRecordingResumed).toHaveBeenCalled();
      });

      act(() => {
        resumedCallback();
      });

      expect(result.current.isPaused).toBe(false);
      expect(result.current.isActive).toBe(true);
    });
  });

  describe('RecordingStatus enum', () => {
    it('has all expected values', () => {
      expect(RecordingStatus.IDLE).toBe('idle');
      expect(RecordingStatus.STARTING).toBe('starting');
      expect(RecordingStatus.RECORDING).toBe('recording');
      expect(RecordingStatus.STOPPING).toBe('stopping');
      expect(RecordingStatus.PROCESSING_TRANSCRIPTS).toBe('processing');
      expect(RecordingStatus.SAVING).toBe('saving');
      expect(RecordingStatus.COMPLETED).toBe('completed');
      expect(RecordingStatus.ERROR).toBe('error');
    });
  });
});
