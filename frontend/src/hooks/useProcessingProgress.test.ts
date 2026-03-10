import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useProcessingProgress } from './useProcessingProgress';

describe('useProcessingProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const renderProgressHook = () => renderHook(() => useProcessingProgress());

  // ── Initial state ─────────────────────────────────────────────────

  it('should return initial progress with zero counts', () => {
    const { result } = renderProgressHook();

    expect(result.current.progress).toEqual({
      total_chunks: 0,
      completed_chunks: 0,
      processing_chunks: 0,
      failed_chunks: 0,
      chunks: [],
    });
  });

  it('should return null session initially', () => {
    const { result } = renderProgressHook();
    expect(result.current.session).toBeNull();
  });

  it('should not be active initially', () => {
    const { result } = renderProgressHook();
    expect(result.current.isActive).toBe(false);
  });

  it('should not be complete initially', () => {
    const { result } = renderProgressHook();
    expect(result.current.isComplete).toBe(false);
  });

  it('should not have failures initially', () => {
    const { result } = renderProgressHook();
    expect(result.current.hasFailures).toBe(false);
  });

  it('should not be paused initially', () => {
    const { result } = renderProgressHook();
    expect(result.current.isPaused).toBe(false);
  });

  // ── initializeSession ─────────────────────────────────────────────

  it('should initialize session with correct chunk count', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(120000, 30000, 'base.en');
    });

    expect(result.current.progress.total_chunks).toBe(4); // 120000 / 30000
    expect(result.current.session).not.toBeNull();
    expect(result.current.session!.model_name).toBe('base.en');
    expect(result.current.isActive).toBe(true);
  });

  it('should create pending chunks on initialization', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(90000, 30000);
    });

    expect(result.current.progress.chunks).toHaveLength(3);
    expect(result.current.progress.chunks.every(c => c.status === 'pending')).toBe(true);
  });

  it('should ceil chunk count for partial durations', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(95000, 30000);
    });

    expect(result.current.progress.total_chunks).toBe(4); // ceil(95000/30000)
  });

  it('should use default chunk duration of 30s', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(60000);
    });

    expect(result.current.progress.total_chunks).toBe(2);
  });

  it('should generate unique session IDs', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(30000);
    });

    expect(result.current.session!.session_id).toMatch(/^session_\d+$/);
  });

  it('should reset progress on new session initialization', () => {
    const { result } = renderProgressHook();

    // First session
    act(() => {
      result.current.initializeSession(60000, 30000);
      result.current.startChunkProcessing(0);
      result.current.completeChunk(0, 'Hello');
    });

    // Second session
    act(() => {
      result.current.initializeSession(90000, 30000);
    });

    expect(result.current.progress.completed_chunks).toBe(0);
    expect(result.current.progress.processing_chunks).toBe(0);
    expect(result.current.progress.total_chunks).toBe(3);
  });

  // ── startChunkProcessing ──────────────────────────────────────────

  it('should mark chunk as processing', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(60000, 30000);
      result.current.startChunkProcessing(0);
    });

    expect(result.current.progress.processing_chunks).toBe(1);
    expect(result.current.progress.chunks[0].status).toBe('processing');
  });

  it('should set start_time on processing chunk', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(60000, 30000);
      result.current.startChunkProcessing(0);
    });

    expect(result.current.progress.chunks[0].start_time).toBeDefined();
  });

  it('should allow multiple chunks processing simultaneously', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(90000, 30000);
      result.current.startChunkProcessing(0);
      result.current.startChunkProcessing(1);
    });

    expect(result.current.progress.processing_chunks).toBe(2);
  });

  // ── completeChunk ─────────────────────────────────────────────────

  it('should mark chunk as completed', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(60000, 30000);
      result.current.startChunkProcessing(0);
      result.current.completeChunk(0, 'Transcribed text here');
    });

    expect(result.current.progress.completed_chunks).toBe(1);
    expect(result.current.progress.processing_chunks).toBe(0);
    expect(result.current.progress.chunks[0].status).toBe('completed');
  });

  it('should store text preview (first 100 chars)', () => {
    const { result } = renderProgressHook();
    const longText = 'A'.repeat(200);

    act(() => {
      result.current.initializeSession(60000, 30000);
      result.current.startChunkProcessing(0);
      result.current.completeChunk(0, longText);
    });

    expect(result.current.progress.chunks[0].text_preview).toBe('A'.repeat(100));
  });

  it('should calculate duration_ms for completed chunk', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(60000, 30000);
      result.current.startChunkProcessing(0);
    });

    // Wait a bit then complete
    act(() => {
      result.current.completeChunk(0, 'Text');
    });

    expect(result.current.progress.chunks[0].duration_ms).toBeDefined();
    expect(result.current.progress.chunks[0].duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('should trigger isComplete when all chunks completed', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(60000, 30000);
    });

    act(() => {
      result.current.startChunkProcessing(0);
      result.current.completeChunk(0, 'First');
    });

    act(() => {
      result.current.startChunkProcessing(1);
      result.current.completeChunk(1, 'Second');
    });

    expect(result.current.isComplete).toBe(true);
  });

  // ── failChunk ─────────────────────────────────────────────────────

  it('should mark chunk as failed with error message', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(60000, 30000);
      result.current.startChunkProcessing(0);
      result.current.failChunk(0, 'Model error');
    });

    expect(result.current.progress.failed_chunks).toBe(1);
    expect(result.current.progress.processing_chunks).toBe(0);
    expect(result.current.progress.chunks[0].status).toBe('failed');
    expect(result.current.progress.chunks[0].error_message).toBe('Model error');
  });

  it('should set hasFailures when a chunk fails', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(60000, 30000);
      result.current.startChunkProcessing(0);
      result.current.failChunk(0, 'Error');
    });

    expect(result.current.hasFailures).toBe(true);
  });

  it('should not go below zero processing_chunks on fail', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(60000, 30000);
      // Fail without starting (edge case)
      result.current.failChunk(0, 'Error');
    });

    expect(result.current.progress.processing_chunks).toBe(0);
  });

  // ── pauseProcessing / resumeProcessing ────────────────────────────

  it('should pause processing', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(60000, 30000);
    });

    // pauseProcessing depends on `session` in its useCallback deps,
    // so session must be set (flushed) before calling it
    act(() => {
      result.current.pauseProcessing();
    });

    expect(result.current.isPaused).toBe(true);
  });

  it('should resume processing', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(60000, 30000);
    });

    act(() => {
      result.current.pauseProcessing();
    });

    expect(result.current.isPaused).toBe(true);

    act(() => {
      result.current.resumeProcessing();
    });

    expect(result.current.isPaused).toBe(false);
  });

  it('should not crash on pause without session', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.pauseProcessing();
    });

    expect(result.current.isPaused).toBe(false);
  });

  it('should not crash on resume without session', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.resumeProcessing();
    });

    expect(result.current.isPaused).toBe(false);
  });

  // ── cancelProcessing ──────────────────────────────────────────────

  it('should cancel processing and reset all state', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(60000, 30000);
      result.current.startChunkProcessing(0);
    });

    act(() => {
      result.current.cancelProcessing();
    });

    expect(result.current.isActive).toBe(false);
    expect(result.current.session).toBeNull();
    expect(result.current.progress.total_chunks).toBe(0);
    expect(result.current.progress.chunks).toEqual([]);
  });

  // ── reset ─────────────────────────────────────────────────────────

  it('should reset all state', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(60000, 30000);
      result.current.startChunkProcessing(0);
      result.current.completeChunk(0, 'Done');
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.isActive).toBe(false);
    expect(result.current.session).toBeNull();
    expect(result.current.progress.total_chunks).toBe(0);
    expect(result.current.progress.completed_chunks).toBe(0);
  });

  // ── saveProgressState / loadProgressState ─────────────────────────

  it('should save progress state to localStorage', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(60000, 30000, 'small.en');
      result.current.startChunkProcessing(0);
      result.current.completeChunk(0, 'Text');
    });

    let savedState: any;
    act(() => {
      savedState = result.current.saveProgressState();
    });

    expect(savedState).not.toBeNull();
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'transcription_progress',
      expect.any(String)
    );
  });

  it('should return null when saving without session', () => {
    const { result } = renderProgressHook();

    let savedState: any;
    act(() => {
      savedState = result.current.saveProgressState();
    });

    expect(savedState).toBeNull();
  });

  it('should load progress state from localStorage', () => {
    const savedState = JSON.stringify({
      session: {
        session_id: 'session_123',
        total_audio_duration_ms: 60000,
        chunk_duration_ms: 30000,
        start_time: Date.now(),
        is_paused: false,
        model_name: 'small.en',
      },
      progress: {
        total_chunks: 2,
        completed_chunks: 1,
        processing_chunks: 0,
        failed_chunks: 0,
        chunks: [
          { chunk_id: 0, status: 'completed' },
          { chunk_id: 1, status: 'pending' },
        ],
      },
      is_active: true,
      processing_times: {},
    });

    localStorage.setItem('transcription_progress', savedState);

    const { result } = renderProgressHook();

    let loaded: boolean;
    act(() => {
      loaded = result.current.loadProgressState();
    });

    expect(loaded!).toBe(true);
    expect(result.current.isActive).toBe(true);
    expect(result.current.progress.completed_chunks).toBe(1);
    expect(result.current.session!.model_name).toBe('small.en');
  });

  it('should return false when no saved state exists', () => {
    const { result } = renderProgressHook();

    let loaded: boolean;
    act(() => {
      loaded = result.current.loadProgressState();
    });

    expect(loaded!).toBe(false);
  });

  it('should return false on corrupted saved state', () => {
    localStorage.setItem('transcription_progress', 'not-json');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderProgressHook();

    let loaded: boolean;
    act(() => {
      loaded = result.current.loadProgressState();
    });

    expect(loaded!).toBe(false);
    vi.mocked(console.error).mockRestore();
  });

  // ── clearSavedState ───────────────────────────────────────────────

  it('should clear saved state from localStorage', () => {
    localStorage.setItem('transcription_progress', '{}');

    const { result } = renderProgressHook();

    act(() => {
      result.current.clearSavedState();
    });

    expect(localStorage.removeItem).toHaveBeenCalledWith('transcription_progress');
  });

  // ── Estimated time calculation ────────────────────────────────────

  it('should not have estimated time with no completed chunks', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(60000, 30000);
    });

    expect(result.current.progress.estimated_remaining_ms).toBeUndefined();
  });

  it('should calculate estimated remaining time after completions', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(120000, 30000); // 4 chunks
      result.current.startChunkProcessing(0);
      result.current.completeChunk(0, 'Done');
    });

    // After completing 1 of 4 chunks, estimated_remaining_ms should exist
    // It may take a re-render for the useEffect to update
    expect(result.current.progress.estimated_remaining_ms).toBeDefined();
  });

  // ── Mixed operations ──────────────────────────────────────────────

  it('should handle mixed complete and fail operations', () => {
    const { result } = renderProgressHook();

    act(() => {
      result.current.initializeSession(90000, 30000); // 3 chunks
    });

    act(() => {
      result.current.startChunkProcessing(0);
      result.current.completeChunk(0, 'OK');
    });

    act(() => {
      result.current.startChunkProcessing(1);
      result.current.failChunk(1, 'Timeout');
    });

    act(() => {
      result.current.startChunkProcessing(2);
      result.current.completeChunk(2, 'OK');
    });

    expect(result.current.progress.completed_chunks).toBe(2);
    expect(result.current.progress.failed_chunks).toBe(1);
    expect(result.current.progress.processing_chunks).toBe(0);
    expect(result.current.hasFailures).toBe(true);
    expect(result.current.isComplete).toBe(false); // 2 completed != 3 total
  });
});
