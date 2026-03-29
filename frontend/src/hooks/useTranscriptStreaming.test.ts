import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TranscriptSegmentData } from '@/types';
import { useTranscriptStreaming } from './useTranscriptStreaming';

describe('useTranscriptStreaming', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const makeSegment = (id: string, text: string): TranscriptSegmentData => ({
    id,
    timestamp: 0,
    text,
    confidence: 0.95,
  });

  // ── Initial state ─────────────────────────────────────────────────

  it('should return null streamingSegmentId initially', () => {
    const { result } = renderHook(() =>
      useTranscriptStreaming([], false, true)
    );

    expect(result.current.streamingSegmentId).toBeNull();
  });

  it('should return getDisplayText function', () => {
    const { result } = renderHook(() =>
      useTranscriptStreaming([], false, true)
    );

    expect(typeof result.current.getDisplayText).toBe('function');
  });

  // ── No streaming when disabled ────────────────────────────────────

  it('should not stream when isRecording is false', () => {
    const segments = [makeSegment('1', 'Hello world testing')];

    const { result } = renderHook(() =>
      useTranscriptStreaming(segments, false, true)
    );

    expect(result.current.streamingSegmentId).toBeNull();
  });

  it('should not stream when enableStreaming is false', () => {
    const segments = [makeSegment('1', 'Hello world testing')];

    const { result } = renderHook(() =>
      useTranscriptStreaming(segments, true, false)
    );

    expect(result.current.streamingSegmentId).toBeNull();
  });

  it('should not stream when segments array is empty', () => {
    const { result } = renderHook(() =>
      useTranscriptStreaming([], true, true)
    );

    expect(result.current.streamingSegmentId).toBeNull();
  });

  // ── Streaming new segment ─────────────────────────────────────────

  it('should start streaming the latest segment', () => {
    const segments = [makeSegment('seg-1', 'This is a longer test segment for streaming')];

    const { result } = renderHook(() =>
      useTranscriptStreaming(segments, true, true)
    );

    expect(result.current.streamingSegmentId).toBe('seg-1');
  });

  it('should show initial characters immediately', () => {
    const text = 'This is a longer test segment for streaming';
    const segments = [makeSegment('seg-1', text)];

    const { result } = renderHook(() =>
      useTranscriptStreaming(segments, true, true)
    );

    const displayText = result.current.getDisplayText(segments[0]);
    expect(displayText).toBe(text.substring(0, 5)); // INITIAL_CHARS = 5
  });

  it('should progressively reveal more characters over time', () => {
    const text = 'This is a much longer test segment that needs progressive streaming reveal over time';
    const segments = [makeSegment('seg-1', text)];

    const { result } = renderHook(() =>
      useTranscriptStreaming(segments, true, true)
    );

    const initialDisplay = result.current.getDisplayText(segments[0]);
    expect(initialDisplay.length).toBe(5);

    // Advance one tick (33ms)
    act(() => {
      vi.advanceTimersByTime(33);
    });

    const midDisplay = result.current.getDisplayText(segments[0]);
    expect(midDisplay.length).toBeGreaterThan(5);
  });

  it('should show full text after streaming completes', () => {
    const text = 'This is a longer text for streaming completion test';
    const segments = [makeSegment('seg-1', text)];

    const { result } = renderHook(() =>
      useTranscriptStreaming(segments, true, true)
    );

    // Advance past the total streaming duration (800ms)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const displayText = result.current.getDisplayText(segments[0]);
    expect(displayText).toBe(text);
  });

  // ── Short text ────────────────────────────────────────────────────

  it('should show short text immediately without streaming', () => {
    const text = 'Hi'; // Shorter than INITIAL_CHARS (5)
    const segments = [makeSegment('seg-1', text)];

    const { result } = renderHook(() =>
      useTranscriptStreaming(segments, true, true)
    );

    const displayText = result.current.getDisplayText(segments[0]);
    expect(displayText).toBe(text);
  });

  it('should show text exactly at INITIAL_CHARS length without streaming interval', () => {
    const text = 'Hello'; // Exactly 5 chars = INITIAL_CHARS
    const segments = [makeSegment('seg-1', text)];

    const { result } = renderHook(() =>
      useTranscriptStreaming(segments, true, true)
    );

    const displayText = result.current.getDisplayText(segments[0]);
    expect(displayText).toBe('Hello');
  });

  // ── New segment detection ─────────────────────────────────────────

  it('should detect new segment and restart streaming', () => {
    const text1 = 'First segment with enough text for streaming';
    const text2 = 'Second segment with enough text for streaming too';

    const { result, rerender } = renderHook(
      ({ segs }) => useTranscriptStreaming(segs, true, true),
      { initialProps: { segs: [makeSegment('seg-1', text1)] } }
    );

    // Complete first streaming
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.getDisplayText(makeSegment('seg-1', text1))).toBe(text1);

    // Add new segment
    rerender({ segs: [makeSegment('seg-1', text1), makeSegment('seg-2', text2)] });

    expect(result.current.streamingSegmentId).toBe('seg-2');
    const display = result.current.getDisplayText(makeSegment('seg-2', text2));
    expect(display).toBe(text2.substring(0, 5));
  });

  it('should not restart streaming for same segment ID', () => {
    const text = 'Same segment text for testing';
    const segments = [makeSegment('seg-1', text)];

    const { result, rerender } = renderHook(
      ({ segs }) => useTranscriptStreaming(segs, true, true),
      { initialProps: { segs: segments } }
    );

    // Advance partway through streaming
    act(() => {
      vi.advanceTimersByTime(200);
    });

    const midDisplay = result.current.getDisplayText(segments[0]);

    // Rerender with same segments
    rerender({ segs: [makeSegment('seg-1', text)] });

    // Should still show the same progress, not restart
    const afterRerenderDisplay = result.current.getDisplayText(segments[0]);
    expect(afterRerenderDisplay.length).toBeGreaterThanOrEqual(midDisplay.length);
  });

  // ── getDisplayText for non-streaming segments ─────────────────────

  it('should return full text for non-streaming segment', () => {
    const streamingText = 'Currently streaming this text right now';
    const otherText = 'This is an older segment';
    const segments = [
      makeSegment('old-1', otherText),
      makeSegment('new-1', streamingText),
    ];

    const { result } = renderHook(() =>
      useTranscriptStreaming(segments, true, true)
    );

    // Old segment should return full text
    expect(result.current.getDisplayText(segments[0])).toBe(otherText);
  });

  // ── Cleanup on recording stop ─────────────────────────────────────

  it('should clear streaming when recording stops', () => {
    const text = 'Text being streamed during recording';
    const segments = [makeSegment('seg-1', text)];

    const { result, rerender } = renderHook(
      ({ recording }) => useTranscriptStreaming(segments, recording, true),
      { initialProps: { recording: true } }
    );

    expect(result.current.streamingSegmentId).toBe('seg-1');

    // Stop recording
    rerender({ recording: false });

    expect(result.current.streamingSegmentId).toBeNull();
  });

  it('should clear streaming when streaming is disabled', () => {
    const text = 'Text being streamed with streaming enabled';
    const segments = [makeSegment('seg-1', text)];

    const { result, rerender } = renderHook(
      ({ enable }) => useTranscriptStreaming(segments, true, enable),
      { initialProps: { enable: true } }
    );

    expect(result.current.streamingSegmentId).toBe('seg-1');

    rerender({ enable: false });
    expect(result.current.streamingSegmentId).toBeNull();
  });

  // ── Interval cleanup ──────────────────────────────────────────────

  it('should clear interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const text = 'Long text that takes time to stream through the display';
    const segments = [makeSegment('seg-1', text)];

    const { unmount } = renderHook(() =>
      useTranscriptStreaming(segments, true, true)
    );

    unmount();

    // clearInterval should have been called at least once during cleanup
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('should clear previous interval when new segment arrives', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const text1 = 'First segment with enough text to trigger streaming';
    const text2 = 'Second segment with enough text to trigger streaming';

    const { rerender } = renderHook(
      ({ segs }) => useTranscriptStreaming(segs, true, true),
      { initialProps: { segs: [makeSegment('seg-1', text1)] } }
    );

    const callsBefore = clearIntervalSpy.mock.calls.length;

    rerender({ segs: [makeSegment('seg-1', text1), makeSegment('seg-2', text2)] });

    expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    clearIntervalSpy.mockRestore();
  });

  // ── Characters per tick calculation ───────────────────────────────

  it('should reveal at least 2 characters per tick', () => {
    // Very long text to ensure charsPerTick > 2
    const text = 'A'.repeat(200);
    const segments = [makeSegment('seg-1', text)];

    const { result } = renderHook(() =>
      useTranscriptStreaming(segments, true, true)
    );

    // After one tick
    act(() => {
      vi.advanceTimersByTime(33);
    });

    const display = result.current.getDisplayText(segments[0]);
    // Should have revealed at least INITIAL_CHARS + 2
    expect(display.length).toBeGreaterThanOrEqual(7);
  });
});
