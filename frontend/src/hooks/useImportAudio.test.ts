import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useRouter } from 'next/navigation';

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock useSidebar
const mockSetCurrentMeeting = vi.fn();
const mockRefetchMeetings = vi.fn().mockResolvedValue(undefined);
vi.mock('@/components/Sidebar/SidebarProvider', () => ({
  useSidebar: () => ({
    setCurrentMeeting: mockSetCurrentMeeting,
    refetchMeetings: mockRefetchMeetings,
  }),
}));

import { useImportAudio } from './useImportAudio';
import { toast } from 'sonner';

describe('useImportAudio', () => {
  const invokeMock = invoke as Mock;
  const listenMock = listen as Mock;
  let mockPush: Mock;
  let progressCallback: ((event: any) => void) | null = null;

  beforeEach(() => {
    mockPush = vi.fn();
    (useRouter as Mock).mockReturnValue({
      push: mockPush,
      back: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      refresh: vi.fn(),
    });

    invokeMock.mockReset();
    mockSetCurrentMeeting.mockClear();
    mockRefetchMeetings.mockClear().mockResolvedValue(undefined);
    progressCallback = null;

    listenMock.mockImplementation((event: string, cb: (e: any) => void) => {
      if (event === 'import-progress') {
        progressCallback = cb;
      }
      return Promise.resolve(vi.fn());
    });
  });

  // ── Initial State ──────────────────────────────────────────────────

  it('should initialize with isImporting false', () => {
    const { result } = renderHook(() => useImportAudio());

    expect(result.current.isImporting).toBe(false);
  });

  it('should initialize with empty progress', () => {
    const { result } = renderHook(() => useImportAudio());

    expect(result.current.progress).toEqual({ stage: '', percent: 0, message: '' });
  });

  it('should expose importAudio function', () => {
    const { result } = renderHook(() => useImportAudio());

    expect(typeof result.current.importAudio).toBe('function');
  });

  // ── Event Listener ─────────────────────────────────────────────────

  it('should register import-progress listener on mount', async () => {
    renderHook(() => useImportAudio());

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalledWith('import-progress', expect.any(Function));
    });
  });

  it('should update progress when import-progress event fires', async () => {
    const { result } = renderHook(() => useImportAudio());

    await waitFor(() => {
      expect(progressCallback).not.toBeNull();
    });

    act(() => {
      progressCallback!({
        payload: { stage: 'transcribing', percent: 50, message: 'Processing...' },
      });
    });

    expect(result.current.progress).toEqual({
      stage: 'transcribing',
      percent: 50,
      message: 'Processing...',
    });
  });

  it('should clean up listener on unmount', async () => {
    const unlistenFn = vi.fn();
    listenMock.mockResolvedValue(unlistenFn);

    const { unmount } = renderHook(() => useImportAudio());

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalled();
    });

    unmount();
    expect(unlistenFn).toHaveBeenCalled();
  });

  // ── Successful Import ──────────────────────────────────────────────

  it('should handle successful import', async () => {
    invokeMock.mockResolvedValue({
      status: 'success',
      meeting_id: 'meeting-123',
      meeting_name: 'Imported Call',
      segments_count: 42,
      duration_seconds: 3600,
    });

    const { result } = renderHook(() => useImportAudio());

    await act(async () => {
      await result.current.importAudio();
    });

    expect(invokeMock).toHaveBeenCalledWith('import_audio_file', {});
    expect(toast.success).toHaveBeenCalledWith('Audio imported successfully', {
      description: '42 segments transcribed',
    });
    expect(mockRefetchMeetings).toHaveBeenCalled();
    expect(mockSetCurrentMeeting).toHaveBeenCalledWith({
      id: 'meeting-123',
      title: 'Imported Call',
    });
    expect(mockPush).toHaveBeenCalledWith('/meeting-details?id=meeting-123');
    expect(result.current.isImporting).toBe(false);
  });

  it('should use default title when meeting_name is not provided', async () => {
    invokeMock.mockResolvedValue({
      status: 'success',
      meeting_id: 'meeting-456',
      segments_count: 10,
    });

    const { result } = renderHook(() => useImportAudio());

    await act(async () => {
      await result.current.importAudio();
    });

    expect(mockSetCurrentMeeting).toHaveBeenCalledWith({
      id: 'meeting-456',
      title: 'Imported Meeting',
    });
  });

  // ── Cancelled Import ───────────────────────────────────────────────

  it('should handle cancelled import (user closed file picker)', async () => {
    invokeMock.mockResolvedValue({ status: 'cancelled' });

    const { result } = renderHook(() => useImportAudio());

    await act(async () => {
      await result.current.importAudio();
    });

    expect(result.current.isImporting).toBe(false);
    expect(result.current.progress).toEqual({ stage: '', percent: 0, message: '' });
    expect(toast.success).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── Error Handling ─────────────────────────────────────────────────

  it('should handle import error with Error object', async () => {
    invokeMock.mockRejectedValue(new Error('Unsupported format'));

    const { result } = renderHook(() => useImportAudio());

    await act(async () => {
      await result.current.importAudio();
    });

    expect(toast.error).toHaveBeenCalledWith('Import failed', {
      description: 'Unsupported format',
    });
    expect(result.current.isImporting).toBe(false);
    expect(result.current.progress).toEqual({
      stage: 'error',
      percent: 0,
      message: 'Unsupported format',
    });
  });

  it('should handle import error with string error', async () => {
    invokeMock.mockRejectedValue('string error');

    const { result } = renderHook(() => useImportAudio());

    await act(async () => {
      await result.current.importAudio();
    });

    expect(toast.error).toHaveBeenCalledWith('Import failed', {
      description: 'string error',
    });
  });

  // ── Guard Against Double Import ────────────────────────────────────

  it('should not start a second import while one is in progress', async () => {
    let resolveImport: (value: any) => void;
    invokeMock.mockImplementation(
      () => new Promise((resolve) => { resolveImport = resolve; })
    );

    const { result } = renderHook(() => useImportAudio());

    // Start first import
    let firstImport: Promise<void>;
    act(() => {
      firstImport = result.current.importAudio();
    });

    expect(result.current.isImporting).toBe(true);

    // Try second import
    await act(async () => {
      await result.current.importAudio();
    });

    // invoke should only have been called once
    expect(invokeMock).toHaveBeenCalledTimes(1);

    // Resolve the first import
    await act(async () => {
      resolveImport!({ status: 'cancelled' });
      await firstImport;
    });
  });

  // ── isImporting Transitions ────────────────────────────────────────

  it('should set isImporting to true while importing', async () => {
    let resolveImport: (value: any) => void;
    invokeMock.mockImplementation(
      () => new Promise((resolve) => { resolveImport = resolve; })
    );

    const { result } = renderHook(() => useImportAudio());

    let importPromise: Promise<void>;
    act(() => {
      importPromise = result.current.importAudio();
    });

    expect(result.current.isImporting).toBe(true);

    await act(async () => {
      resolveImport!({ status: 'cancelled' });
      await importPromise;
    });

    expect(result.current.isImporting).toBe(false);
  });

  it('should set initial progress when starting import', async () => {
    let resolveImport: (value: any) => void;
    invokeMock.mockImplementation(
      () => new Promise((resolve) => { resolveImport = resolve; })
    );

    const { result } = renderHook(() => useImportAudio());

    act(() => {
      result.current.importAudio();
    });

    expect(result.current.progress).toEqual({
      stage: 'starting',
      percent: 0,
      message: 'Opening file picker...',
    });

    await act(async () => {
      resolveImport!({ status: 'cancelled' });
    });
  });
});
