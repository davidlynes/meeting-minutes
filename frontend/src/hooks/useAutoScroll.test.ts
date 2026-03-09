import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useAutoScroll } from './useAutoScroll';
import { createRef } from 'react';

describe('useAutoScroll', () => {
  let scrollRef: React.RefObject<HTMLDivElement | null>;
  let mockDiv: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    mockDiv = document.createElement('div');

    // Mock scroll properties (all must be configurable for tests to redefine them)
    Object.defineProperties(mockDiv, {
      scrollTop: { value: 0, writable: true, configurable: true },
      scrollHeight: { value: 1000, writable: true, configurable: true },
      clientHeight: { value: 500, writable: true, configurable: true },
    });

    scrollRef = { current: mockDiv } as React.RefObject<HTMLDivElement>;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const defaultProps = () => ({
    scrollRef,
    segments: [],
    isRecording: false,
    isPaused: false,
  });

  // ── Initial State ──────────────────────────────────────────────────

  it('should initialize with autoScroll enabled', () => {
    const { result } = renderHook(() => useAutoScroll(defaultProps()));

    expect(result.current.autoScroll).toBe(true);
  });

  it('should expose setAutoScroll function', () => {
    const { result } = renderHook(() => useAutoScroll(defaultProps()));

    expect(typeof result.current.setAutoScroll).toBe('function');
  });

  it('should expose scrollToBottom function', () => {
    const { result } = renderHook(() => useAutoScroll(defaultProps()));

    expect(typeof result.current.scrollToBottom).toBe('function');
  });

  // ── scrollToBottom ─────────────────────────────────────────────────

  it('should scroll to bottom when scrollToBottom is called', () => {
    const { result } = renderHook(() => useAutoScroll(defaultProps()));

    act(() => {
      result.current.scrollToBottom();
    });

    expect(mockDiv.scrollTop).toBe(mockDiv.scrollHeight);
  });

  it('should re-enable autoScroll when scrollToBottom is called', () => {
    const { result } = renderHook(() => useAutoScroll(defaultProps()));

    act(() => {
      result.current.setAutoScroll(false);
    });
    expect(result.current.autoScroll).toBe(false);

    act(() => {
      result.current.scrollToBottom();
    });
    expect(result.current.autoScroll).toBe(true);
  });

  it('should do nothing if scrollRef.current is null', () => {
    const nullRef = { current: null } as React.RefObject<HTMLDivElement | null>;
    const { result } = renderHook(() =>
      useAutoScroll({ ...defaultProps(), scrollRef: nullRef })
    );

    // Should not throw
    act(() => {
      result.current.scrollToBottom();
    });
  });

  // ── setAutoScroll ──────────────────────────────────────────────────

  it('should allow manual control of autoScroll', () => {
    const { result } = renderHook(() => useAutoScroll(defaultProps()));

    act(() => {
      result.current.setAutoScroll(false);
    });
    expect(result.current.autoScroll).toBe(false);

    act(() => {
      result.current.setAutoScroll(true);
    });
    expect(result.current.autoScroll).toBe(true);
  });

  // ── Scroll Event Detection ────────────────────────────────────────

  it('should attach scroll listener to the container', () => {
    const addSpy = vi.spyOn(mockDiv, 'addEventListener');

    renderHook(() => useAutoScroll(defaultProps()));

    expect(addSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
  });

  it('should remove scroll listener on unmount', () => {
    const removeSpy = vi.spyOn(mockDiv, 'removeEventListener');

    const { unmount } = renderHook(() => useAutoScroll(defaultProps()));
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('should disable autoScroll when user scrolls away from bottom', () => {
    const { result } = renderHook(() => useAutoScroll(defaultProps()));

    // Simulate user scrolling up (far from bottom)
    Object.defineProperty(mockDiv, 'scrollTop', { value: 100, writable: true, configurable: true });
    Object.defineProperty(mockDiv, 'scrollHeight', { value: 1000, writable: true, configurable: true });
    Object.defineProperty(mockDiv, 'clientHeight', { value: 500, writable: true, configurable: true });
    // scrollHeight(1000) - scrollTop(100) - clientHeight(500) = 400 > 100 threshold

    act(() => {
      mockDiv.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(150); // debounce timeout
    });

    expect(result.current.autoScroll).toBe(false);
  });

  it('should re-enable autoScroll when user scrolls to bottom', () => {
    const { result } = renderHook(() => useAutoScroll(defaultProps()));

    // First scroll away
    Object.defineProperty(mockDiv, 'scrollTop', { value: 100, writable: true, configurable: true });
    act(() => {
      mockDiv.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(150);
    });
    expect(result.current.autoScroll).toBe(false);

    // Then scroll back to bottom
    Object.defineProperty(mockDiv, 'scrollTop', { value: 480, writable: true, configurable: true });
    // scrollHeight(1000) - scrollTop(480) - clientHeight(500) = 20 < 100 threshold
    act(() => {
      mockDiv.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(150);
    });

    expect(result.current.autoScroll).toBe(true);
  });

  // ── Auto-scroll on New Segments ────────────────────────────────────

  it('should auto-scroll when new segments arrive during recording', () => {
    // Start near bottom
    Object.defineProperty(mockDiv, 'scrollTop', { value: 480, writable: true, configurable: true });

    const { result, rerender } = renderHook(
      (props) => useAutoScroll(props),
      {
        initialProps: {
          ...defaultProps(),
          segments: [{ id: '1' }],
          isRecording: true,
          isPaused: false,
        },
      }
    );

    const prevScrollTop = mockDiv.scrollTop;

    rerender({
      ...defaultProps(),
      segments: [{ id: '1' }, { id: '2' }],
      isRecording: true,
      isPaused: false,
    });

    // scrollTop should be set to scrollHeight
    expect(mockDiv.scrollTop).toBe(mockDiv.scrollHeight);
  });

  it('should NOT auto-scroll when not recording', () => {
    Object.defineProperty(mockDiv, 'scrollTop', { value: 480, writable: true, configurable: true });

    const { rerender } = renderHook(
      (props) => useAutoScroll(props),
      {
        initialProps: {
          ...defaultProps(),
          segments: [{ id: '1' }],
          isRecording: false,
        },
      }
    );

    const scrollTopBefore = mockDiv.scrollTop;

    rerender({
      ...defaultProps(),
      segments: [{ id: '1' }, { id: '2' }],
      isRecording: false,
    });

    expect(mockDiv.scrollTop).toBe(scrollTopBefore);
  });

  it('should NOT auto-scroll when recording is paused', () => {
    Object.defineProperty(mockDiv, 'scrollTop', { value: 480, writable: true, configurable: true });

    const { rerender } = renderHook(
      (props) => useAutoScroll(props),
      {
        initialProps: {
          ...defaultProps(),
          segments: [{ id: '1' }],
          isRecording: true,
          isPaused: true,
        },
      }
    );

    const scrollTopBefore = mockDiv.scrollTop;

    rerender({
      ...defaultProps(),
      segments: [{ id: '1' }, { id: '2' }],
      isRecording: true,
      isPaused: true,
    });

    expect(mockDiv.scrollTop).toBe(scrollTopBefore);
  });

  it('should NOT auto-scroll when disableAutoScroll is true', () => {
    Object.defineProperty(mockDiv, 'scrollTop', { value: 480, writable: true, configurable: true });

    const { rerender } = renderHook(
      (props) => useAutoScroll(props),
      {
        initialProps: {
          ...defaultProps(),
          segments: [{ id: '1' }],
          isRecording: true,
          disableAutoScroll: true,
        },
      }
    );

    const scrollTopBefore = mockDiv.scrollTop;

    rerender({
      ...defaultProps(),
      segments: [{ id: '1' }, { id: '2' }],
      isRecording: true,
      disableAutoScroll: true,
    });

    expect(mockDiv.scrollTop).toBe(scrollTopBefore);
  });

  // ── Active Segment Scrolling ───────────────────────────────────────

  it('should scroll to active segment when activeSegmentId changes', () => {
    const mockElement = document.createElement('div');
    mockElement.id = 'segment-abc';
    // scrollIntoView is not available in JSDOM; define it before spying
    mockElement.scrollIntoView = vi.fn();
    document.body.appendChild(mockElement);
    const scrollIntoViewSpy = vi.spyOn(mockElement, 'scrollIntoView').mockImplementation(() => {});

    const { rerender } = renderHook(
      (props) => useAutoScroll(props),
      {
        initialProps: {
          ...defaultProps(),
          segments: [{ id: 'abc' }],
        },
      }
    );

    rerender({
      ...defaultProps(),
      segments: [{ id: 'abc' }],
      activeSegmentId: 'abc',
    });

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });

    document.body.removeChild(mockElement);
  });
});
