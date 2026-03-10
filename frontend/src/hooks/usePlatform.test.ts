import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';

// We need to control the dynamic import of @tauri-apps/plugin-os
const mockPlatform = vi.fn();
vi.mock('@tauri-apps/plugin-os', () => ({
  platform: mockPlatform,
}));

import { usePlatform, useIsLinux } from './usePlatform';

describe('usePlatform', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    // Reset __TAURI_INTERNALS__ before each test
    (window as any).__TAURI_INTERNALS__ = undefined;
    mockPlatform.mockReset();
  });

  // ── User Agent Fallback ────────────────────────────────────────────

  it('should detect macOS from user agent when not in Tauri', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      configurable: true,
    });

    const { result } = renderHook(() => usePlatform());
    expect(result.current).toBe('macos');

    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  });

  it('should detect Windows from user agent when not in Tauri', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      configurable: true,
    });

    const { result } = renderHook(() => usePlatform());
    expect(result.current).toBe('windows');

    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  });

  it('should detect Linux from user agent when not in Tauri', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' },
      configurable: true,
    });

    const { result } = renderHook(() => usePlatform());
    expect(result.current).toBe('linux');

    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  });

  it('should return unknown for unrecognized user agents', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'SomeOtherBrowser/1.0' },
      configurable: true,
    });

    const { result } = renderHook(() => usePlatform());
    expect(result.current).toBe('unknown');

    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  });

  // ── Tauri Platform Detection ───────────────────────────────────────

  it('should detect macos from Tauri plugin-os', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    mockPlatform.mockResolvedValue('macos');

    const { result } = renderHook(() => usePlatform());

    await waitFor(() => {
      expect(result.current).toBe('macos');
    });
  });

  it('should detect windows from Tauri plugin-os', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    mockPlatform.mockResolvedValue('windows');

    const { result } = renderHook(() => usePlatform());

    await waitFor(() => {
      expect(result.current).toBe('windows');
    });
  });

  it('should detect linux from Tauri plugin-os', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    mockPlatform.mockResolvedValue('linux');

    const { result } = renderHook(() => usePlatform());

    await waitFor(() => {
      expect(result.current).toBe('linux');
    });
  });

  it('should map ios to macos', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    mockPlatform.mockResolvedValue('ios');

    const { result } = renderHook(() => usePlatform());

    await waitFor(() => {
      expect(result.current).toBe('macos');
    });
  });

  it('should map android to linux', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    mockPlatform.mockResolvedValue('android');

    const { result } = renderHook(() => usePlatform());

    await waitFor(() => {
      expect(result.current).toBe('linux');
    });
  });

  it('should return unknown for unrecognized Tauri platform', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    mockPlatform.mockResolvedValue('freebsd');

    const { result } = renderHook(() => usePlatform());

    await waitFor(() => {
      expect(result.current).toBe('unknown');
    });
  });

  it('should fall back to user agent if Tauri platform() throws', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    mockPlatform.mockRejectedValue(new Error('plugin not available'));

    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      configurable: true,
    });

    const { result } = renderHook(() => usePlatform());

    await waitFor(() => {
      expect(result.current).toBe('windows');
    });

    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  });
});

describe('useIsLinux', () => {
  beforeEach(() => {
    (window as any).__TAURI_INTERNALS__ = undefined;
    mockPlatform.mockReset();
  });

  it('should return true when platform is linux', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' },
      configurable: true,
    });

    const { result } = renderHook(() => useIsLinux());
    expect(result.current).toBe(true);

    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)' },
      configurable: true,
    });
  });

  it('should return false when platform is not linux', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      configurable: true,
    });

    const { result } = renderHook(() => useIsLinux());
    expect(result.current).toBe(false);
  });
});
