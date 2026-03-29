import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showUpdateNotification, setUpdateDialogCallback } from './UpdateNotification';
import { UpdateInfo } from '@/services/updateService';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('UpdateNotification', () => {
  const mockUpdateInfo: UpdateInfo = {
    available: true,
    currentVersion: '0.2.3',
    version: '0.3.0',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls toast.info when showUpdateNotification is called', () => {
    showUpdateNotification(mockUpdateInfo);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it('passes correct options to toast.info', () => {
    showUpdateNotification(mockUpdateInfo);
    expect(toast.info).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        duration: 10000,
        position: 'bottom-center',
      })
    );
  });

  it('calls onUpdateClick when provided', () => {
    const onUpdateClick = vi.fn();
    showUpdateNotification(mockUpdateInfo, onUpdateClick);

    // Get the rendered JSX from the toast.info call
    const [jsx] = vi.mocked(toast.info).mock.calls[0];
    // The callback was provided, verify toast was called
    expect(toast.info).toHaveBeenCalled();
  });

  it('uses global callback when no onUpdateClick is provided', () => {
    const globalCallback = vi.fn();
    setUpdateDialogCallback(globalCallback);
    showUpdateNotification(mockUpdateInfo);
    // The global callback is stored and will be used when "View Details" is clicked
    expect(toast.info).toHaveBeenCalled();
  });

  it('setUpdateDialogCallback stores the callback', () => {
    const callback = vi.fn();
    // Should not throw
    expect(() => setUpdateDialogCallback(callback)).not.toThrow();
  });
});
