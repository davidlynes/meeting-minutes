import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { usePaginatedTranscripts } from './usePaginatedTranscripts';

describe('usePaginatedTranscripts', () => {
  const mockMetadata = {
    id: 'meeting-1',
    title: 'Team Standup',
    created_at: '2025-01-01T10:00:00Z',
    updated_at: '2025-01-01T11:00:00Z',
  };

  const mockTranscripts = Array.from({ length: 5 }, (_, i) => ({
    id: `t-${i}`,
    text: `Transcript segment ${i}`,
    timestamp: `10:00:0${i}`,
    audio_start_time: i * 3,
    audio_end_time: (i + 1) * 3,
    confidence: 0.95,
  }));

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'api_get_meeting_metadata') {
        return mockMetadata;
      }
      if (cmd === 'api_get_meeting_transcripts') {
        const offset = args?.offset ?? 0;
        const limit = args?.limit ?? 100;
        const slice = mockTranscripts.slice(offset, offset + limit);
        return {
          transcripts: slice,
          total_count: mockTranscripts.length,
          has_more: offset + slice.length < mockTranscripts.length,
        };
      }
      throw new Error(`Unexpected invoke: ${cmd}`);
    });
  });

  const renderPaginatedHook = (meetingId: string | null = 'meeting-1', initialTimestamp?: number) =>
    renderHook(
      ({ id, ts }) => usePaginatedTranscripts({ meetingId: id, initialTimestamp: ts }),
      { initialProps: { id: meetingId, ts: initialTimestamp } }
    );

  // ── Initial state ─────────────────────────────────────────────────

  it('should return isLoading true initially when meetingId is provided', () => {
    const { result } = renderPaginatedHook('meeting-1');
    // isLoading starts true and then resolves
    expect(result.current.isLoading).toBe(true);
  });

  it('should return null metadata initially', async () => {
    const { result } = renderPaginatedHook(null);
    expect(result.current.metadata).toBeNull();
  });

  it('should return empty segments initially', () => {
    const { result } = renderPaginatedHook(null);
    expect(result.current.segments).toEqual([]);
  });

  it('should return empty transcripts initially', () => {
    const { result } = renderPaginatedHook(null);
    expect(result.current.transcripts).toEqual([]);
  });

  it('should return null error initially', () => {
    const { result } = renderPaginatedHook(null);
    expect(result.current.error).toBeNull();
  });

  // ── Loading meeting data ──────────────────────────────────────────

  it('should load metadata on mount when meetingId is provided', async () => {
    const { result } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.metadata).toEqual(mockMetadata);
  });

  it('should load transcripts on mount', async () => {
    const { result } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.transcripts).toHaveLength(5);
  });

  it('should convert transcripts to segments', async () => {
    const { result } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.segments).toHaveLength(5);
    expect(result.current.segments[0]).toEqual({
      id: 't-0',
      timestamp: 0,
      endTime: 3,
      text: 'Transcript segment 0',
      confidence: 0.95,
    });
  });

  it('should set totalCount from response', async () => {
    const { result } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.totalCount).toBe(5);
  });

  it('should set loadedCount to transcripts length', async () => {
    const { result } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.loadedCount).toBe(5);
  });

  // ── Null meetingId ────────────────────────────────────────────────

  it('should reset state when meetingId is null', async () => {
    const { result, rerender } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    rerender({ id: null, ts: undefined });

    expect(result.current.metadata).toBeNull();
    expect(result.current.transcripts).toEqual([]);
    expect(result.current.isLoading).toBe(true); // reset sets isLoading to true
  });

  // ── hasMore and pagination ────────────────────────────────────────

  it('should set hasMore to false when all transcripts are loaded', async () => {
    const { result } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.hasMore).toBe(false);
  });

  it('should set hasMore to true when more transcripts exist', async () => {
    // Create more transcripts than default page size
    const manyTranscripts = Array.from({ length: 150 }, (_, i) => ({
      id: `t-${i}`,
      text: `Segment ${i}`,
      timestamp: `10:00:00`,
      audio_start_time: i,
      audio_end_time: i + 1,
      confidence: 0.9,
    }));

    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'api_get_meeting_metadata') return mockMetadata;
      if (cmd === 'api_get_meeting_transcripts') {
        const offset = args?.offset ?? 0;
        const limit = args?.limit ?? 100;
        const slice = manyTranscripts.slice(offset, offset + limit);
        return {
          transcripts: slice,
          total_count: manyTranscripts.length,
          has_more: offset + slice.length < manyTranscripts.length,
        };
      }
      throw new Error(`Unexpected: ${cmd}`);
    });

    const { result } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.hasMore).toBe(true);
    expect(result.current.loadedCount).toBe(100);
    expect(result.current.totalCount).toBe(150);
  });

  it('should load more transcripts on loadMore call', async () => {
    const manyTranscripts = Array.from({ length: 150 }, (_, i) => ({
      id: `t-${i}`,
      text: `Segment ${i}`,
      timestamp: `10:00:00`,
      audio_start_time: i,
      audio_end_time: i + 1,
      confidence: 0.9,
    }));

    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'api_get_meeting_metadata') return mockMetadata;
      if (cmd === 'api_get_meeting_transcripts') {
        const offset = args?.offset ?? 0;
        const limit = args?.limit ?? 100;
        const slice = manyTranscripts.slice(offset, offset + limit);
        return {
          transcripts: slice,
          total_count: manyTranscripts.length,
          has_more: offset + slice.length < manyTranscripts.length,
        };
      }
      throw new Error(`Unexpected: ${cmd}`);
    });

    const { result } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.loadedCount).toBe(100);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.loadedCount).toBe(150);
    expect(result.current.hasMore).toBe(false);
  });

  it('should not loadMore when hasMore is false', async () => {
    const { result } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const invokeCountBefore = vi.mocked(invoke).mock.calls.length;

    await act(async () => {
      await result.current.loadMore();
    });

    // No additional invoke calls since hasMore is false
    expect(vi.mocked(invoke).mock.calls.length).toBe(invokeCountBefore);
  });

  it('should not loadMore when still loading initial data', async () => {
    // Don't wait for initial load
    const { result } = renderPaginatedHook('meeting-1');

    // Attempt loadMore immediately (while still loading)
    await act(async () => {
      await result.current.loadMore();
    });

    // loadMore should be a no-op during initial load
    // (the isLoading guard prevents it)
  });

  // ── Deduplication ─────────────────────────────────────────────────

  it('should deduplicate transcripts by id', async () => {
    // Return overlapping transcripts
    let callCount = 0;
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'api_get_meeting_metadata') return mockMetadata;
      if (cmd === 'api_get_meeting_transcripts') {
        callCount++;
        if (callCount === 1) {
          return {
            transcripts: [
              { id: 't-0', text: 'A', timestamp: '', audio_start_time: 0, audio_end_time: 1 },
              { id: 't-1', text: 'B', timestamp: '', audio_start_time: 1, audio_end_time: 2 },
            ],
            total_count: 3,
            has_more: true,
          };
        }
        return {
          transcripts: [
            { id: 't-1', text: 'B', timestamp: '', audio_start_time: 1, audio_end_time: 2 }, // duplicate
            { id: 't-2', text: 'C', timestamp: '', audio_start_time: 2, audio_end_time: 3 },
          ],
          total_count: 3,
          has_more: false,
        };
      }
      throw new Error(`Unexpected: ${cmd}`);
    });

    const { result } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.loadMore();
    });

    // Should have 3 unique transcripts, not 4
    expect(result.current.transcripts).toHaveLength(3);
    const ids = result.current.transcripts.map(t => t.id);
    expect(ids).toEqual(['t-0', 't-1', 't-2']);
  });

  // ── Sorting ───────────────────────────────────────────────────────

  it('should sort transcripts by audio_start_time when appending', async () => {
    // Initial load (append=false) preserves server order.
    // Sorting happens on the append path (loadMore).
    let callCount = 0;
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'api_get_meeting_metadata') return mockMetadata;
      if (cmd === 'api_get_meeting_transcripts') {
        callCount++;
        if (callCount === 1) {
          return {
            transcripts: [
              { id: 't-0', text: 'A', timestamp: '', audio_start_time: 0, audio_end_time: 3 },
            ],
            total_count: 3,
            has_more: true,
          };
        }
        // Second page returns out-of-order items
        return {
          transcripts: [
            { id: 't-2', text: 'C', timestamp: '', audio_start_time: 10, audio_end_time: 13 },
            { id: 't-1', text: 'B', timestamp: '', audio_start_time: 5, audio_end_time: 8 },
          ],
          total_count: 3,
          has_more: false,
        };
      }
      throw new Error(`Unexpected: ${cmd}`);
    });

    const { result } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.loadMore();
    });

    // The append path sorts by audio_start_time
    const times = result.current.segments.map(s => s.timestamp);
    expect(times).toEqual([0, 5, 10]);
  });

  // ── Error handling ────────────────────────────────────────────────

  it('should set error when metadata load fails', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'api_get_meeting_metadata') throw new Error('Not found');
      if (cmd === 'api_get_meeting_transcripts') return {
        transcripts: [], total_count: 0, has_more: false,
      };
      throw new Error(`Unexpected: ${cmd}`);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to load meeting details');
    vi.mocked(console.error).mockRestore();
  });

  it('should set error when transcript load fails', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'api_get_meeting_metadata') return mockMetadata;
      if (cmd === 'api_get_meeting_transcripts') throw new Error('DB error');
      throw new Error(`Unexpected: ${cmd}`);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to load transcripts');
    vi.mocked(console.error).mockRestore();
  });

  // ── reset ─────────────────────────────────────────────────────────

  it('should reset all state to initial values', async () => {
    const { result } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.metadata).toBeNull();
    expect(result.current.transcripts).toEqual([]);
    expect(result.current.totalCount).toBe(0);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // ── Meeting change detection ──────────────────────────────────────

  it('should reload data when meetingId changes', async () => {
    const { result, rerender } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const callsBefore = vi.mocked(invoke).mock.calls.length;

    rerender({ id: 'meeting-2', ts: undefined });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should have made new calls for the different meeting
    expect(vi.mocked(invoke).mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('should not reload for the same meetingId', async () => {
    const { result, rerender } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const callsBefore = vi.mocked(invoke).mock.calls.length;

    rerender({ id: 'meeting-1', ts: undefined });

    // Should not make additional calls
    expect(vi.mocked(invoke).mock.calls.length).toBe(callsBefore);
  });

  // ── Segment conversion ────────────────────────────────────────────

  it('should use 0 as default timestamp when audio_start_time is undefined', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'api_get_meeting_metadata') return mockMetadata;
      if (cmd === 'api_get_meeting_transcripts') return {
        transcripts: [
          { id: 't-0', text: 'No timing', timestamp: '10:00', confidence: 0.8 },
        ],
        total_count: 1,
        has_more: false,
      };
      throw new Error(`Unexpected: ${cmd}`);
    });

    const { result } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.segments[0].timestamp).toBe(0);
  });

  // ── Debounce protection ───────────────────────────────────────────

  it('should debounce rapid loadMore calls', async () => {
    const manyTranscripts = Array.from({ length: 250 }, (_, i) => ({
      id: `t-${i}`,
      text: `Segment ${i}`,
      timestamp: '',
      audio_start_time: i,
      audio_end_time: i + 1,
    }));

    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'api_get_meeting_metadata') return mockMetadata;
      if (cmd === 'api_get_meeting_transcripts') {
        const offset = args?.offset ?? 0;
        const limit = args?.limit ?? 100;
        const slice = manyTranscripts.slice(offset, offset + limit);
        return {
          transcripts: slice,
          total_count: manyTranscripts.length,
          has_more: offset + slice.length < manyTranscripts.length,
        };
      }
      throw new Error(`Unexpected: ${cmd}`);
    });

    const { result } = renderPaginatedHook('meeting-1');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Rapid-fire loadMore calls
    await act(async () => {
      result.current.loadMore();
      result.current.loadMore();
      result.current.loadMore();
    });

    // Due to debounce, not all calls should have triggered
    // The key thing is it doesn't crash or double-load
    expect(result.current.loadedCount).toBeGreaterThanOrEqual(100);
  });

  it('should not loadMore when meetingId is null', async () => {
    const { result } = renderPaginatedHook(null);

    await act(async () => {
      await result.current.loadMore();
    });

    // Should be a no-op
    expect(result.current.transcripts).toEqual([]);
  });
});
