import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showRecordingNotification } from './recordingNotification';

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn().mockReturnValue('toast-id-1'),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

// Mock Analytics
vi.mock('@/lib/analytics', () => ({
  default: {
    trackButtonClick: vi.fn(),
  },
}));

// Mock @tauri-apps/plugin-store (overriding the global setup for this file)
const mockStoreGet = vi.fn();
const mockStoreSet = vi.fn();
const mockStoreSave = vi.fn();
vi.mock('@tauri-apps/plugin-store', () => ({
  Store: {
    load: vi.fn().mockResolvedValue({
      get: mockStoreGet,
      set: mockStoreSet,
      save: mockStoreSave,
    }),
  },
}));

describe('showRecordingNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreGet.mockResolvedValue(true); // show_recording_notification = true
  });

  it('shows toast when preference is true', async () => {
    const { toast } = await import('sonner');

    await showRecordingNotification();

    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining('Recording Started'),
      expect.objectContaining({
        duration: 10000,
        position: 'bottom-right',
      })
    );
  });

  it('does not show toast when preference is false', async () => {
    const { toast } = await import('sonner');
    mockStoreGet.mockResolvedValue(false);

    await showRecordingNotification();

    expect(toast.info).not.toHaveBeenCalled();
  });

  it('shows toast when preference is null (default to true)', async () => {
    const { toast } = await import('sonner');
    mockStoreGet.mockResolvedValue(null); // null means not set, defaults to true

    await showRecordingNotification();

    expect(toast.info).toHaveBeenCalled();
  });

  it('does not throw if store loading fails', async () => {
    const { Store } = await import('@tauri-apps/plugin-store');
    vi.mocked(Store.load).mockRejectedValueOnce(new Error('Store error'));

    // Should not throw
    await expect(showRecordingNotification()).resolves.toBeUndefined();
  });
});
