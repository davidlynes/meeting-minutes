import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

import { useAudioPlayer } from './useAudioPlayer';

// Mock AudioContext
class MockAudioBufferSourceNode {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
  createBufferSource = vi.fn(() => new MockAudioBufferSourceNode());
  decodeAudioData = vi.fn(
    (data: ArrayBuffer, success: (buf: AudioBuffer) => void, error: (e: Error) => void) => {
      const mockBuffer = {
        duration: 120,
        length: 5760000,
        numberOfChannels: 2,
        sampleRate: 48000,
        getChannelData: vi.fn(),
        copyFromChannel: vi.fn(),
        copyToChannel: vi.fn(),
      } as unknown as AudioBuffer;
      success(mockBuffer);
    }
  );
}

describe('useAudioPlayer', () => {
  const invokeMock = invoke as Mock;
  let mockAudioContext: MockAudioContext;

  beforeEach(() => {
    mockAudioContext = new MockAudioContext();
    // Must use a class (not vi.fn with arrow) so `new AudioContext()` works
    (window as any).AudioContext = class { constructor() { return mockAudioContext as any; } };
    (window as any).webkitAudioContext = class { constructor() { return mockAudioContext as any; } };

    invokeMock.mockReset();

    // Mock requestAnimationFrame
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      return setTimeout(cb, 16) as unknown as number;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Initial State ──────────────────────────────────────────────────

  it('should initialize with default state when no audioPath', () => {
    const { result } = renderHook(() => useAudioPlayer(null));

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTime).toBe(0);
    expect(result.current.duration).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it('should expose play, pause, and seek functions', () => {
    const { result } = renderHook(() => useAudioPlayer(null));

    expect(typeof result.current.play).toBe('function');
    expect(typeof result.current.pause).toBe('function');
    expect(typeof result.current.seek).toBe('function');
  });

  // ── Audio Loading ──────────────────────────────────────────────────

  it('should load audio when audioPath is provided', async () => {
    invokeMock.mockResolvedValue([72, 69, 76, 76, 79]); // fake audio bytes

    const { result } = renderHook(() => useAudioPlayer('/path/to/audio.wav'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('read_audio_file', {
        filePath: '/path/to/audio.wav',
      });
    });

    await waitFor(() => {
      expect(result.current.duration).toBe(120);
    });
  });

  it('should not load audio when audioPath is null', () => {
    renderHook(() => useAudioPlayer(null));

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('should reload audio when audioPath changes', async () => {
    invokeMock.mockResolvedValue([72, 69, 76, 76, 79]);

    const { rerender } = renderHook(
      (path) => useAudioPlayer(path),
      { initialProps: '/path/audio1.wav' as string | null }
    );

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('read_audio_file', {
        filePath: '/path/audio1.wav',
      });
    });

    invokeMock.mockClear();

    rerender('/path/audio2.wav');

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('read_audio_file', {
        filePath: '/path/audio2.wav',
      });
    });
  });

  it('should set error when audio data is empty', async () => {
    invokeMock.mockResolvedValue([]);

    const { result } = renderHook(() => useAudioPlayer('/path/to/empty.wav'));

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load audio file');
    });
  });

  it('should set error when invoke fails', async () => {
    invokeMock.mockRejectedValue(new Error('File not found'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useAudioPlayer('/path/to/missing.wav'));

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load audio file');
    });
  });

  // ── Play ───────────────────────────────────────────────────────────

  it('should set isPlaying to true when play is called', async () => {
    invokeMock.mockResolvedValue([72, 69, 76, 76, 79]);

    const { result } = renderHook(() => useAudioPlayer('/path/audio.wav'));

    await waitFor(() => {
      expect(result.current.duration).toBe(120);
    });

    await act(async () => {
      await result.current.play();
    });

    expect(result.current.isPlaying).toBe(true);
  });

  it('should create buffer source and start playback', async () => {
    invokeMock.mockResolvedValue([72, 69, 76, 76, 79]);

    const { result } = renderHook(() => useAudioPlayer('/path/audio.wav'));

    await waitFor(() => {
      expect(result.current.duration).toBe(120);
    });

    await act(async () => {
      await result.current.play();
    });

    const source = mockAudioContext.createBufferSource.mock.results[0]?.value;
    expect(source).toBeDefined();
    expect(source.connect).toHaveBeenCalled();
    expect(source.start).toHaveBeenCalled();
  });

  it('should set error when playing without loaded audio', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useAudioPlayer(null));

    await act(async () => {
      await result.current.play();
    });

    expect(result.current.error).toBe('Failed to play audio');
    expect(result.current.isPlaying).toBe(false);
  });

  // ── Pause ──────────────────────────────────────────────────────────

  it('should set isPlaying to false when pause is called', async () => {
    invokeMock.mockResolvedValue([72, 69, 76, 76, 79]);

    const { result } = renderHook(() => useAudioPlayer('/path/audio.wav'));

    await waitFor(() => {
      expect(result.current.duration).toBe(120);
    });

    await act(async () => {
      await result.current.play();
    });
    expect(result.current.isPlaying).toBe(true);

    act(() => {
      result.current.pause();
    });
    expect(result.current.isPlaying).toBe(false);
  });

  it('should stop the source node on pause', async () => {
    invokeMock.mockResolvedValue([72, 69, 76, 76, 79]);

    const { result } = renderHook(() => useAudioPlayer('/path/audio.wav'));

    await waitFor(() => {
      expect(result.current.duration).toBe(120);
    });

    await act(async () => {
      await result.current.play();
    });

    const source = mockAudioContext.createBufferSource.mock.results.at(-1)?.value;

    act(() => {
      result.current.pause();
    });

    expect(source.stop).toHaveBeenCalled();
  });

  // ── Seek ───────────────────────────────────────────────────────────

  it('should update currentTime when seeking', async () => {
    invokeMock.mockResolvedValue([72, 69, 76, 76, 79]);

    const { result } = renderHook(() => useAudioPlayer('/path/audio.wav'));

    await waitFor(() => {
      expect(result.current.duration).toBe(120);
    });

    await act(async () => {
      await result.current.seek(30);
    });

    expect(result.current.currentTime).toBe(30);
  });

  it('should clamp seek to 0 for negative values', async () => {
    invokeMock.mockResolvedValue([72, 69, 76, 76, 79]);

    const { result } = renderHook(() => useAudioPlayer('/path/audio.wav'));

    await waitFor(() => {
      expect(result.current.duration).toBe(120);
    });

    await act(async () => {
      await result.current.seek(-10);
    });

    expect(result.current.currentTime).toBe(0);
  });

  it('should clamp seek to duration for values exceeding duration', async () => {
    invokeMock.mockResolvedValue([72, 69, 76, 76, 79]);

    const { result } = renderHook(() => useAudioPlayer('/path/audio.wav'));

    await waitFor(() => {
      expect(result.current.duration).toBe(120);
    });

    await act(async () => {
      await result.current.seek(999);
    });

    expect(result.current.currentTime).toBe(120);
  });

  it('should resume playback after seek if was playing', async () => {
    invokeMock.mockResolvedValue([72, 69, 76, 76, 79]);

    const { result } = renderHook(() => useAudioPlayer('/path/audio.wav'));

    await waitFor(() => {
      expect(result.current.duration).toBe(120);
    });

    await act(async () => {
      await result.current.play();
    });
    expect(result.current.isPlaying).toBe(true);

    await act(async () => {
      await result.current.seek(60);
    });

    expect(result.current.isPlaying).toBe(true);
  });

  it('should not resume playback after seek if was paused', async () => {
    invokeMock.mockResolvedValue([72, 69, 76, 76, 79]);

    const { result } = renderHook(() => useAudioPlayer('/path/audio.wav'));

    await waitFor(() => {
      expect(result.current.duration).toBe(120);
    });

    await act(async () => {
      await result.current.seek(60);
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTime).toBe(60);
  });

  // ── Cleanup ────────────────────────────────────────────────────────

  it('should close AudioContext on unmount', async () => {
    invokeMock.mockResolvedValue([72, 69, 76, 76, 79]);

    const { result, unmount } = renderHook(() => useAudioPlayer('/path/audio.wav'));

    await waitFor(() => {
      expect(result.current.duration).toBe(120);
    });

    unmount();

    expect(mockAudioContext.close).toHaveBeenCalled();
  });

  // ── AudioContext initialization ────────────────────────────────────

  it('should resume suspended AudioContext', async () => {
    mockAudioContext.state = 'suspended';
    invokeMock.mockResolvedValue([72, 69, 76, 76, 79]);

    renderHook(() => useAudioPlayer('/path/audio.wav'));

    await waitFor(() => {
      expect(mockAudioContext.resume).toHaveBeenCalled();
    });
  });

  it('should handle AudioContext initialization failure', async () => {
    (window as any).AudioContext = class { constructor() { throw new Error('AudioContext not supported'); } };
    (window as any).webkitAudioContext = undefined;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useAudioPlayer('/path/audio.wav'));

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to initialize audio');
    });
  });
});
