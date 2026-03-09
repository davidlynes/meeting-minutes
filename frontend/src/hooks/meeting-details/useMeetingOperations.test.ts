import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMeetingOperations } from './useMeetingOperations';
import { invoke } from '@tauri-apps/api/core';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const mockMeeting = {
  id: 'meeting-123',
  title: 'Test Meeting',
};

describe('useMeetingOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleOpenMeetingFolder', () => {
    it('calls invoke with correct meeting id', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      const { result } = renderHook(() =>
        useMeetingOperations({ meeting: mockMeeting })
      );

      await act(async () => {
        await result.current.handleOpenMeetingFolder();
      });

      expect(invoke).toHaveBeenCalledWith('open_meeting_folder', {
        meetingId: 'meeting-123',
      });
    });

    it('shows error toast on failure', async () => {
      vi.mocked(invoke).mockRejectedValueOnce('Folder not found');

      const { result } = renderHook(() =>
        useMeetingOperations({ meeting: mockMeeting })
      );

      const { toast } = await import('sonner');

      await act(async () => {
        await result.current.handleOpenMeetingFolder();
      });

      expect(toast.error).toHaveBeenCalledWith('Folder not found');
    });

    it('shows generic error when error is non-string', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(null);

      const { result } = renderHook(() =>
        useMeetingOperations({ meeting: mockMeeting })
      );

      const { toast } = await import('sonner');

      await act(async () => {
        await result.current.handleOpenMeetingFolder();
      });

      expect(toast.error).toHaveBeenCalledWith('Failed to open recording folder');
    });
  });
});
