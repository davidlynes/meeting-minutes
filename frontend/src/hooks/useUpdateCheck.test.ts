import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock updateService
const mockCheckForUpdates = vi.fn();
const mockWasCheckedRecently = vi.fn();

vi.mock('@/services/updateService', () => ({
  updateService: {
    checkForUpdates: (...args: any[]) => mockCheckForUpdates(...args),
    wasCheckedRecently: () => mockWasCheckedRecently(),
  },
  UpdateInfo: {},
}));

// Mock showUpdateNotification
const mockShowUpdateNotification = vi.fn();
vi.mock('@/components/UpdateNotification', () => ({
  showUpdateNotification: (...args: any[]) => mockShowUpdateNotification(...args),
}));

import { useUpdateCheck } from './useUpdateCheck';

describe('useUpdateCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockCheckForUpdates.mockReset();
    mockWasCheckedRecently.mockReset();
    mockShowUpdateNotification.mockReset();
    mockWasCheckedRecently.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Initial State ──────────────────────────────────────────────────

  it('should initialize with null updateInfo and not checking', () => {
    const { result } = renderHook(() => useUpdateCheck({ checkOnMount: false }));

    expect(result.current.updateInfo).toBeNull();
    expect(result.current.isChecking).toBe(false);
  });

  it('should expose checkForUpdates function', () => {
    const { result } = renderHook(() => useUpdateCheck({ checkOnMount: false }));

    expect(typeof result.current.checkForUpdates).toBe('function');
  });

  // ── Check on Mount ─────────────────────────────────────────────────

  it('should check for updates on mount by default (after 2s delay)', async () => {
    mockCheckForUpdates.mockResolvedValue({ available: false, currentVersion: '1.0.0' });

    renderHook(() => useUpdateCheck());

    // Should not check immediately
    expect(mockCheckForUpdates).not.toHaveBeenCalled();

    // Advance past the 2s delay
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    expect(mockCheckForUpdates).toHaveBeenCalledWith(false);
  });

  it('should not check on mount when checkOnMount is false', async () => {
    renderHook(() => useUpdateCheck({ checkOnMount: false }));

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockCheckForUpdates).not.toHaveBeenCalled();
  });

  it('should clean up timer on unmount', () => {
    mockCheckForUpdates.mockResolvedValue({ available: false, currentVersion: '1.0.0' });

    const { unmount } = renderHook(() => useUpdateCheck());

    unmount();

    // Advance time; check should NOT fire after unmount
    vi.advanceTimersByTime(5000);
    expect(mockCheckForUpdates).not.toHaveBeenCalled();
  });

  // ── Update Available ───────────────────────────────────────────────

  it('should set updateInfo when update is available', async () => {
    const updateInfo = {
      available: true,
      currentVersion: '1.0.0',
      version: '2.0.0',
      body: 'New features',
    };
    mockCheckForUpdates.mockResolvedValue(updateInfo);

    const { result } = renderHook(() => useUpdateCheck({ checkOnMount: false }));

    await act(async () => {
      await result.current.checkForUpdates(true);
    });

    expect(result.current.updateInfo).toEqual(updateInfo);
  });

  it('should call onUpdateAvailable callback when provided', async () => {
    const updateInfo = {
      available: true,
      currentVersion: '1.0.0',
      version: '2.0.0',
    };
    mockCheckForUpdates.mockResolvedValue(updateInfo);
    const onUpdateAvailable = vi.fn();

    const { result } = renderHook(() =>
      useUpdateCheck({ checkOnMount: false, onUpdateAvailable })
    );

    await act(async () => {
      await result.current.checkForUpdates(true);
    });

    expect(onUpdateAvailable).toHaveBeenCalledWith(updateInfo);
  });

  it('should show notification when update is available and showNotification is true', async () => {
    const updateInfo = {
      available: true,
      currentVersion: '1.0.0',
      version: '2.0.0',
    };
    mockCheckForUpdates.mockResolvedValue(updateInfo);

    const { result } = renderHook(() =>
      useUpdateCheck({ checkOnMount: false, showNotification: true })
    );

    await act(async () => {
      await result.current.checkForUpdates(true);
    });

    expect(mockShowUpdateNotification).toHaveBeenCalledWith(
      updateInfo,
      expect.any(Function)
    );
  });

  it('should prefer onUpdateAvailable over showNotification', async () => {
    const updateInfo = {
      available: true,
      currentVersion: '1.0.0',
      version: '2.0.0',
    };
    mockCheckForUpdates.mockResolvedValue(updateInfo);
    const onUpdateAvailable = vi.fn();

    const { result } = renderHook(() =>
      useUpdateCheck({
        checkOnMount: false,
        showNotification: true,
        onUpdateAvailable,
      })
    );

    await act(async () => {
      await result.current.checkForUpdates(true);
    });

    expect(onUpdateAvailable).toHaveBeenCalled();
    expect(mockShowUpdateNotification).not.toHaveBeenCalled();
  });

  // ── No Update Available ────────────────────────────────────────────

  it('should set updateInfo but not show notification when no update', async () => {
    const noUpdate = { available: false, currentVersion: '1.0.0' };
    mockCheckForUpdates.mockResolvedValue(noUpdate);

    const { result } = renderHook(() => useUpdateCheck({ checkOnMount: false }));

    await act(async () => {
      await result.current.checkForUpdates(true);
    });

    expect(result.current.updateInfo).toEqual(noUpdate);
    expect(mockShowUpdateNotification).not.toHaveBeenCalled();
  });

  // ── Skip If Checked Recently ───────────────────────────────────────

  it('should skip check if recently checked (non-forced)', async () => {
    mockWasCheckedRecently.mockReturnValue(true);

    const { result } = renderHook(() => useUpdateCheck({ checkOnMount: false }));

    await act(async () => {
      await result.current.checkForUpdates(false);
    });

    expect(mockCheckForUpdates).not.toHaveBeenCalled();
  });

  it('should force check even if recently checked', async () => {
    mockWasCheckedRecently.mockReturnValue(true);
    mockCheckForUpdates.mockResolvedValue({ available: false, currentVersion: '1.0.0' });

    const { result } = renderHook(() => useUpdateCheck({ checkOnMount: false }));

    await act(async () => {
      await result.current.checkForUpdates(true);
    });

    expect(mockCheckForUpdates).toHaveBeenCalledWith(true);
  });

  // ── isChecking State ───────────────────────────────────────────────

  it('should set isChecking to true while checking', async () => {
    let resolveCheck: (value: any) => void;
    mockCheckForUpdates.mockImplementation(
      () => new Promise((resolve) => { resolveCheck = resolve; })
    );

    const { result } = renderHook(() => useUpdateCheck({ checkOnMount: false }));

    let checkPromise: Promise<void>;
    act(() => {
      checkPromise = result.current.checkForUpdates(true);
    });

    expect(result.current.isChecking).toBe(true);

    await act(async () => {
      resolveCheck!({ available: false, currentVersion: '1.0.0' });
      await checkPromise!;
    });

    expect(result.current.isChecking).toBe(false);
  });

  // ── Error Handling ─────────────────────────────────────────────────

  it('should handle errors gracefully and reset isChecking', async () => {
    mockCheckForUpdates.mockRejectedValue(new Error('Network error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useUpdateCheck({ checkOnMount: false }));

    await act(async () => {
      await result.current.checkForUpdates(true);
    });

    expect(result.current.isChecking).toBe(false);
    expect(result.current.updateInfo).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
