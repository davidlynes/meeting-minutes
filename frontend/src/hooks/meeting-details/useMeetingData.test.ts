import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMeetingData } from './useMeetingData';
import { invoke } from '@tauri-apps/api/core';

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock sidebar context
const mockSetCurrentMeeting = vi.fn();
const mockSetMeetings = vi.fn();
vi.mock('@/components/Sidebar/SidebarProvider', () => ({
  useSidebar: vi.fn(() => ({
    setCurrentMeeting: mockSetCurrentMeeting,
    setMeetings: mockSetMeetings,
    meetings: [{ id: 'meeting-1', title: 'Test Meeting' }],
  })),
}));

const mockMeeting = {
  id: 'meeting-1',
  title: 'Test Meeting',
  created_at: '2025-01-01T12:00:00Z',
  transcripts: [
    { id: '1', text: 'Hello', timestamp: '12:00:00' },
  ],
};

describe('useMeetingData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state from meeting prop', () => {
    const { result } = renderHook(() =>
      useMeetingData({ meeting: mockMeeting, summaryData: null })
    );

    expect(result.current.meetingTitle).toBe('Test Meeting');
    expect(result.current.transcripts).toEqual(mockMeeting.transcripts);
    expect(result.current.aiSummary).toBeNull();
    expect(result.current.isEditingTitle).toBe(false);
    expect(result.current.isTitleDirty).toBe(false);
    expect(result.current.isSaving).toBe(false);
  });

  it('uses + New Call as default title when meeting has no title', () => {
    const meeting = { ...mockMeeting, title: '' };
    const { result } = renderHook(() =>
      useMeetingData({ meeting, summaryData: null })
    );

    expect(result.current.meetingTitle).toBe('+ New Call');
  });

  it('syncs aiSummary when summaryData prop changes', () => {
    const summary = { section1: { title: 'Test', blocks: [] } } as any;
    const { result, rerender } = renderHook(
      ({ summaryData }) => useMeetingData({ meeting: mockMeeting, summaryData }),
      { initialProps: { summaryData: null as any } }
    );

    expect(result.current.aiSummary).toBeNull();

    rerender({ summaryData: summary });

    expect(result.current.aiSummary).toEqual(summary);
  });

  describe('handleTitleChange', () => {
    it('updates title and marks as dirty', () => {
      const { result } = renderHook(() =>
        useMeetingData({ meeting: mockMeeting, summaryData: null })
      );

      act(() => {
        result.current.handleTitleChange('New Title');
      });

      expect(result.current.meetingTitle).toBe('New Title');
      expect(result.current.isTitleDirty).toBe(true);
    });
  });

  describe('handleSummaryChange', () => {
    it('updates aiSummary state', () => {
      const { result } = renderHook(() =>
        useMeetingData({ meeting: mockMeeting, summaryData: null })
      );

      const newSummary = { section1: { title: 'New', blocks: [] } } as any;
      act(() => {
        result.current.handleSummaryChange(newSummary);
      });

      expect(result.current.aiSummary).toEqual(newSummary);
    });
  });

  describe('handleSaveMeetingTitle', () => {
    it('calls invoke and updates sidebar', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      const { result } = renderHook(() =>
        useMeetingData({ meeting: mockMeeting, summaryData: null })
      );

      act(() => {
        result.current.handleTitleChange('Updated Title');
      });

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.handleSaveMeetingTitle();
      });

      expect(success).toBe(true);
      expect(invoke).toHaveBeenCalledWith('api_save_meeting_title', {
        meetingId: 'meeting-1',
        title: 'Updated Title',
      });
      expect(mockSetCurrentMeeting).toHaveBeenCalledWith({
        id: 'meeting-1',
        title: 'Updated Title',
      });
    });

    it('returns false on failure', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Save failed'));

      const { result } = renderHook(() =>
        useMeetingData({ meeting: mockMeeting, summaryData: null })
      );

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.handleSaveMeetingTitle();
      });

      expect(success).toBe(false);
    });
  });

  describe('handleSaveSummary', () => {
    it('saves markdown format', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      const { result } = renderHook(() =>
        useMeetingData({ meeting: mockMeeting, summaryData: null })
      );

      await act(async () => {
        await result.current.handleSaveSummary({ markdown: '# Summary' } as any);
      });

      expect(invoke).toHaveBeenCalledWith('api_save_meeting_summary', {
        meetingId: 'meeting-1',
        summary: { markdown: '# Summary' },
      });
    });

    it('saves legacy format with structured data', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      const { result } = renderHook(() =>
        useMeetingData({ meeting: mockMeeting, summaryData: null })
      );

      const legacySummary = {
        section1: { title: 'Notes', blocks: [{ content: 'note 1' }] },
      } as any;

      await act(async () => {
        await result.current.handleSaveSummary(legacySummary);
      });

      expect(invoke).toHaveBeenCalledWith('api_save_meeting_summary', expect.objectContaining({
        meetingId: 'meeting-1',
      }));
    });
  });

  describe('updateMeetingTitle', () => {
    it('updates title and sidebar without saving', () => {
      const { result } = renderHook(() =>
        useMeetingData({ meeting: mockMeeting, summaryData: null })
      );

      act(() => {
        result.current.updateMeetingTitle('AI Generated Title');
      });

      expect(result.current.meetingTitle).toBe('AI Generated Title');
      expect(mockSetCurrentMeeting).toHaveBeenCalledWith({
        id: 'meeting-1',
        title: 'AI Generated Title',
      });
    });
  });

  describe('saveAllChanges', () => {
    it('saves dirty title and shows success toast', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useMeetingData({ meeting: mockMeeting, summaryData: null })
      );

      const { toast } = await import('sonner');

      act(() => {
        result.current.handleTitleChange('Changed Title');
      });

      await act(async () => {
        await result.current.saveAllChanges();
      });

      expect(invoke).toHaveBeenCalledWith('api_save_meeting_title', expect.any(Object));
      expect(toast.success).toHaveBeenCalledWith('Changes saved successfully');
    });
  });
});
