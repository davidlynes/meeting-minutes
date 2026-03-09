import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCopyOperations } from './useCopyOperations';
import { invoke } from '@tauri-apps/api/core';

// Mock dependencies
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/analytics', () => ({
  default: {
    trackCopy: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockMeeting = {
  id: 'meeting-1',
  title: 'Test Meeting',
  created_at: '2025-01-01T12:00:00Z',
};

const mockTranscripts = [
  { id: '1', text: 'Hello world', timestamp: '12:00:00', audio_start_time: 0 },
  { id: '2', text: 'How are you', timestamp: '12:00:05', audio_start_time: 5 },
];

const defaultProps = {
  meeting: mockMeeting,
  transcripts: mockTranscripts as any,
  meetingTitle: 'Test Meeting',
  aiSummary: null,
  blockNoteSummaryRef: { current: null } as any,
};

describe('useCopyOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleCopyTranscript', () => {
    it('fetches all transcripts and copies to clipboard', async () => {
      // Mock first call to get total count
      vi.mocked(invoke).mockResolvedValueOnce({
        transcripts: [{ id: '1', text: 'x', timestamp: '12:00:00' }],
        total_count: 2,
        has_more: true,
      });
      // Mock second call to get all transcripts
      vi.mocked(invoke).mockResolvedValueOnce({
        transcripts: mockTranscripts,
        total_count: 2,
        has_more: false,
      });

      const { result } = renderHook(() => useCopyOperations(defaultProps));
      const { copyToClipboard } = await import('@/lib/clipboard');
      const { toast } = await import('sonner');

      await act(async () => {
        await result.current.handleCopyTranscript();
      });

      expect(invoke).toHaveBeenCalledWith('api_get_meeting_transcripts', expect.objectContaining({
        meetingId: 'meeting-1',
      }));
      expect(copyToClipboard).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Transcript copied to clipboard');
    });

    it('shows error when no transcripts available', async () => {
      vi.mocked(invoke).mockResolvedValueOnce({
        transcripts: [],
        total_count: 0,
        has_more: false,
      });

      const { result } = renderHook(() => useCopyOperations(defaultProps));
      const { toast } = await import('sonner');

      await act(async () => {
        await result.current.handleCopyTranscript();
      });

      expect(toast.error).toHaveBeenCalledWith('No transcripts available to copy');
    });

    it('formats timestamps as MM:SS when audio_start_time available', async () => {
      vi.mocked(invoke).mockResolvedValueOnce({
        transcripts: [{ id: '1', text: 'test', timestamp: '12:00:00' }],
        total_count: 1,
        has_more: false,
      });
      vi.mocked(invoke).mockResolvedValueOnce({
        transcripts: [{ id: '1', text: 'test', timestamp: '12:00:00', audio_start_time: 65 }],
        total_count: 1,
        has_more: false,
      });

      const { result } = renderHook(() => useCopyOperations(defaultProps));
      const { copyToClipboard } = await import('@/lib/clipboard');

      await act(async () => {
        await result.current.handleCopyTranscript();
      });

      const copiedText = vi.mocked(copyToClipboard).mock.calls[0][0];
      expect(copiedText).toContain('[01:05]');
    });
  });

  describe('handleCopySummary', () => {
    it('shows error when no summary available', async () => {
      const { result } = renderHook(() => useCopyOperations(defaultProps));
      const { toast } = await import('sonner');

      await act(async () => {
        await result.current.handleCopySummary();
      });

      expect(toast.error).toHaveBeenCalledWith('No summary content available to copy');
    });

    it('copies markdown from aiSummary if available', async () => {
      const props = {
        ...defaultProps,
        aiSummary: { markdown: '# Summary\n\nContent here' } as any,
      };

      const { result } = renderHook(() => useCopyOperations(props));
      const { copyToClipboard } = await import('@/lib/clipboard');
      const { toast } = await import('sonner');

      await act(async () => {
        await result.current.handleCopySummary();
      });

      expect(copyToClipboard).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Summary copied to clipboard');
    });

    it('uses blockNoteSummaryRef markdown if available', async () => {
      const mockRef = {
        current: {
          getMarkdown: vi.fn().mockResolvedValue('# From BlockNote\nContent'),
        },
      };

      const props = {
        ...defaultProps,
        blockNoteSummaryRef: mockRef as any,
      };

      const { result } = renderHook(() => useCopyOperations(props));
      const { copyToClipboard } = await import('@/lib/clipboard');

      await act(async () => {
        await result.current.handleCopySummary();
      });

      expect(mockRef.current.getMarkdown).toHaveBeenCalled();
      expect(copyToClipboard).toHaveBeenCalled();
    });

    it('converts legacy format summary', async () => {
      const props = {
        ...defaultProps,
        aiSummary: {
          section1: {
            title: 'Key Points',
            blocks: [{ content: 'Point 1' }, { content: 'Point 2' }],
          },
        } as any,
      };

      const { result } = renderHook(() => useCopyOperations(props));
      const { copyToClipboard } = await import('@/lib/clipboard');

      await act(async () => {
        await result.current.handleCopySummary();
      });

      const copiedText = vi.mocked(copyToClipboard).mock.calls[0]?.[0] ?? '';
      expect(copiedText).toContain('Key Points');
      expect(copiedText).toContain('Point 1');
    });
  });
});
