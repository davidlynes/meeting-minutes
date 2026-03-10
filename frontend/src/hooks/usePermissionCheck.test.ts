import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import type { Mock } from 'vitest';

import { usePermissionCheck } from './usePermissionCheck';

describe('usePermissionCheck', () => {
  const invokeMock = invoke as Mock;

  beforeEach(() => {
    invokeMock.mockReset();
  });

  const mockDevices = (input: number, output: number) => {
    const devices = [
      ...Array.from({ length: input }, (_, i) => ({
        name: `Mic ${i}`,
        device_type: 'Input' as const,
      })),
      ...Array.from({ length: output }, (_, i) => ({
        name: `Speaker ${i}`,
        device_type: 'Output' as const,
      })),
    ];
    invokeMock.mockResolvedValue(devices);
  };

  // ── Initial State ──────────────────────────────────────────────────

  it('should initialize with isChecking true', () => {
    invokeMock.mockResolvedValue([]);
    const { result } = renderHook(() => usePermissionCheck());

    expect(result.current.isChecking).toBe(true);
    expect(result.current.hasMicrophone).toBe(false);
    expect(result.current.hasSystemAudio).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // ── Permission Check on Mount ──────────────────────────────────────

  it('should check permissions on mount', async () => {
    mockDevices(1, 1);

    const { result } = renderHook(() => usePermissionCheck());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(invokeMock).toHaveBeenCalledWith('get_audio_devices');
    expect(result.current.hasMicrophone).toBe(true);
    expect(result.current.hasSystemAudio).toBe(true);
  });

  // ── Microphone Detection ───────────────────────────────────────────

  it('should detect microphone when input devices exist', async () => {
    mockDevices(2, 0);

    const { result } = renderHook(() => usePermissionCheck());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.hasMicrophone).toBe(true);
    expect(result.current.hasSystemAudio).toBe(false);
  });

  it('should report no microphone when no input devices', async () => {
    mockDevices(0, 2);

    const { result } = renderHook(() => usePermissionCheck());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.hasMicrophone).toBe(false);
    expect(result.current.hasSystemAudio).toBe(true);
  });

  // ── System Audio Detection ─────────────────────────────────────────

  it('should detect system audio when output devices exist', async () => {
    mockDevices(0, 3);

    const { result } = renderHook(() => usePermissionCheck());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.hasSystemAudio).toBe(true);
  });

  it('should report no system audio when no output devices', async () => {
    mockDevices(1, 0);

    const { result } = renderHook(() => usePermissionCheck());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.hasSystemAudio).toBe(false);
  });

  // ── No Devices ─────────────────────────────────────────────────────

  it('should report no permissions when no devices found', async () => {
    mockDevices(0, 0);

    const { result } = renderHook(() => usePermissionCheck());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.hasMicrophone).toBe(false);
    expect(result.current.hasSystemAudio).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // ── Error Handling ─────────────────────────────────────────────────

  it('should set error on invoke failure', async () => {
    invokeMock.mockRejectedValue(new Error('Permission denied'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => usePermissionCheck());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.error).toBe('Permission denied');
    expect(result.current.hasMicrophone).toBe(false);
    expect(result.current.hasSystemAudio).toBe(false);
  });

  it('should handle non-Error rejection', async () => {
    invokeMock.mockRejectedValue('string error');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => usePermissionCheck());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.error).toBe('Failed to check permissions');
  });

  // ── Manual checkPermissions ────────────────────────────────────────

  it('should allow manual re-checking of permissions', async () => {
    // First check: no devices
    invokeMock.mockResolvedValueOnce([]);

    const { result } = renderHook(() => usePermissionCheck());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });
    expect(result.current.hasMicrophone).toBe(false);

    // Second check: devices available
    mockDevices(1, 1);

    await act(async () => {
      await result.current.checkPermissions();
    });

    expect(result.current.hasMicrophone).toBe(true);
    expect(result.current.hasSystemAudio).toBe(true);
  });

  it('should return permission result from checkPermissions', async () => {
    mockDevices(1, 1);

    const { result } = renderHook(() => usePermissionCheck());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    mockDevices(1, 0);
    let checkResult: any;
    await act(async () => {
      checkResult = await result.current.checkPermissions();
    });

    expect(checkResult).toEqual({ hasMicrophone: true, hasSystemAudio: false });
  });

  it('should return false values from checkPermissions on error', async () => {
    invokeMock.mockResolvedValueOnce([]); // initial mount
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => usePermissionCheck());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    invokeMock.mockRejectedValueOnce(new Error('Failed'));

    let checkResult: any;
    await act(async () => {
      checkResult = await result.current.checkPermissions();
    });

    expect(checkResult).toEqual({ hasMicrophone: false, hasSystemAudio: false });
  });

  // ── requestPermissions ─────────────────────────────────────────────

  it('should invoke get_audio_devices and then recheck', async () => {
    vi.useFakeTimers();

    mockDevices(0, 0);

    const { result } = renderHook(() => usePermissionCheck());

    // Flush the initial mount effect
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    invokeMock.mockClear();
    mockDevices(1, 1);

    await act(async () => {
      await result.current.requestPermissions();
    });

    // Should invoke get_audio_devices for the permission trigger
    expect(invokeMock).toHaveBeenCalledWith('get_audio_devices');

    // Advance past the 1s setTimeout for recheck
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    // Should have called invoke again for the recheck
    expect(invokeMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('should handle requestPermissions error gracefully', async () => {
    vi.useFakeTimers();

    mockDevices(0, 0);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => usePermissionCheck());

    // Flush the initial mount effect
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    invokeMock.mockRejectedValueOnce(new Error('Denied'));

    // Should not throw
    await act(async () => {
      await result.current.requestPermissions();
    });

    vi.useRealTimers();
  });

  // ── isChecking transitions ─────────────────────────────────────────

  it('should set isChecking true during manual check and false after', async () => {
    let resolveInvoke!: (value: any) => void;
    invokeMock.mockResolvedValueOnce([]); // initial mount

    const { result } = renderHook(() => usePermissionCheck());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    invokeMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveInvoke = resolve; })
    );

    let checkPromise!: Promise<any>;
    act(() => {
      checkPromise = result.current.checkPermissions();
    });

    expect(result.current.isChecking).toBe(true);

    await act(async () => {
      resolveInvoke([]);
      await checkPromise;
    });

    expect(result.current.isChecking).toBe(false);
  });
});
