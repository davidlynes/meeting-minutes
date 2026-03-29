import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSummaryGeneration } from './useSummaryGeneration';
import { invoke } from '@tauri-apps/api/core';

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  default: {
    trackSummaryGenerationStarted: vi.fn().mockResolvedValue(undefined),
    trackSummaryGenerationCompleted: vi.fn().mockResolvedValue(undefined),
    trackCustomPromptUsed: vi.fn().mockResolvedValue(undefined),
    trackSummaryRegenerated: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/utils', () => ({
  isOllamaNotInstalledError: vi.fn().mockReturnValue(false),
}));

// Mock sidebar
const mockStartSummaryPolling = vi.fn();
const mockStopSummaryPolling = vi.fn();
vi.mock('@/components/Sidebar/SidebarProvider', () => ({
  useSidebar: vi.fn(() => ({
    startSummaryPolling: mockStartSummaryPolling,
    stopSummaryPolling: mockStopSummaryPolling,
    meetings: [],
    setMeetings: vi.fn(),
    setCurrentMeeting: vi.fn(),
  })),
}));

const mockMeeting = {
  id: 'meeting-1',
  title: 'Test Meeting',
  created_at: '2025-01-01T12:00:00Z',
};

const mockTranscripts = [
  { id: '1', text: 'Hello world', timestamp: '12:00:00', audio_start_time: 0 },
];

const mockModelConfig = {
  provider: 'ollama',
  model: 'gemma3:1b',
  whisperModel: 'large-v3',
};

const mockSetAiSummary = vi.fn();
const mockUpdateMeetingTitle = vi.fn();

const defaultProps = {
  meeting: mockMeeting,
  transcripts: mockTranscripts as any,
  modelConfig: mockModelConfig,
  isModelConfigLoading: false,
  selectedTemplate: 'standard_meeting',
  updateMeetingTitle: mockUpdateMeetingTitle,
  setAiSummary: mockSetAiSummary,
};

describe('useSummaryGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial idle state', () => {
    const { result } = renderHook(() => useSummaryGeneration(defaultProps));

    expect(result.current.summaryStatus).toBe('idle');
    expect(result.current.summaryError).toBeNull();
  });

  describe('getSummaryStatusMessage', () => {
    it('returns correct messages for each status', () => {
      const { result } = renderHook(() => useSummaryGeneration(defaultProps));

      expect(result.current.getSummaryStatusMessage('idle')).toBe('');
      expect(result.current.getSummaryStatusMessage('processing')).toBe('Processing transcript...');
      expect(result.current.getSummaryStatusMessage('summarizing')).toBe('Generating summary...');
      expect(result.current.getSummaryStatusMessage('regenerating')).toBe('Regenerating summary...');
      expect(result.current.getSummaryStatusMessage('completed')).toBe('Summary completed');
      expect(result.current.getSummaryStatusMessage('error')).toBe('Error generating summary');
    });
  });

  describe('handleGenerateSummary', () => {
    it('shows info toast when model config is loading', async () => {
      const props = { ...defaultProps, isModelConfigLoading: true };
      const { result } = renderHook(() => useSummaryGeneration(props));
      const { toast } = await import('sonner');

      await act(async () => {
        await result.current.handleGenerateSummary();
      });

      expect(toast.info).toHaveBeenCalledWith('Loading model configuration, please wait...');
    });

    it('shows error when no transcripts available', async () => {
      // Mock empty transcripts
      vi.mocked(invoke).mockResolvedValueOnce({
        transcripts: [],
        total_count: 0,
        has_more: false,
      });

      const { result } = renderHook(() => useSummaryGeneration(defaultProps));
      const { toast } = await import('sonner');

      await act(async () => {
        await result.current.handleGenerateSummary();
      });

      expect(toast.error).toHaveBeenCalledWith('No transcripts available for summary');
    });

    it('fetches transcripts and starts processing', async () => {
      // Mock transcript fetch (first page for count)
      vi.mocked(invoke).mockResolvedValueOnce({
        transcripts: mockTranscripts,
        total_count: 1,
        has_more: false,
      });
      // Mock transcript fetch (all)
      vi.mocked(invoke).mockResolvedValueOnce({
        transcripts: mockTranscripts,
        total_count: 1,
        has_more: false,
      });
      // Mock Ollama models check
      vi.mocked(invoke).mockResolvedValueOnce([{ name: 'gemma3:1b' }]);
      // Mock process_transcript
      vi.mocked(invoke).mockResolvedValueOnce({ process_id: 'proc-1' });

      const { result } = renderHook(() => useSummaryGeneration(defaultProps));

      await act(async () => {
        await result.current.handleGenerateSummary();
      });

      expect(mockStartSummaryPolling).toHaveBeenCalledWith(
        'meeting-1',
        'proc-1',
        expect.any(Function)
      );
    });
  });

  describe('handleStopGeneration', () => {
    it('calls cancel and stops polling', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      const { result } = renderHook(() => useSummaryGeneration(defaultProps));
      const { toast } = await import('sonner');

      await act(async () => {
        await result.current.handleStopGeneration();
      });

      expect(invoke).toHaveBeenCalledWith('api_cancel_summary', { meetingId: 'meeting-1' });
      expect(mockStopSummaryPolling).toHaveBeenCalledWith('meeting-1');
      expect(result.current.summaryStatus).toBe('idle');
      expect(toast.info).toHaveBeenCalledWith(
        'Summary generation stopped',
        expect.any(Object)
      );
    });

    it('handles cancel invoke failure gracefully', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Cancel failed'));

      const { result } = renderHook(() => useSummaryGeneration(defaultProps));

      await act(async () => {
        await result.current.handleStopGeneration();
      });

      // Should still stop polling and reset status
      expect(mockStopSummaryPolling).toHaveBeenCalledWith('meeting-1');
      expect(result.current.summaryStatus).toBe('idle');
    });
  });

  describe('handleRegenerateSummary', () => {
    it('does nothing when no original transcript', async () => {
      const { result } = renderHook(() => useSummaryGeneration(defaultProps));

      await act(async () => {
        await result.current.handleRegenerateSummary();
      });

      // Should not invoke anything since originalTranscript is empty
      expect(invoke).not.toHaveBeenCalledWith('api_process_transcript', expect.any(Object));
    });
  });
});
