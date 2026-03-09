import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TranscriptView } from './TranscriptView';
import { TooltipProvider } from './ui/tooltip';
import { Transcript } from '@/types';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock RecordingStatusBar
vi.mock('./RecordingStatusBar', () => ({
  RecordingStatusBar: ({ isPaused }: any) => (
    <div data-testid="recording-status-bar">{isPaused ? 'Paused' : 'Recording'}</div>
  ),
}));

// Mock ConfidenceIndicator
vi.mock('./ConfidenceIndicator', () => ({
  ConfidenceIndicator: ({ confidence }: any) => (
    <span data-testid="confidence-indicator">{confidence}</span>
  ),
}));

const mockRecordingState = {
  activeDuration: 0,
  isRecording: false,
  isPaused: false,
  isActive: false,
  recordingDuration: null,
  status: 'idle',
  setStatus: vi.fn(),
  isStopping: false,
  isProcessing: false,
  isSaving: false,
};

vi.mock('@/contexts/RecordingStateContext', () => ({
  useRecordingState: () => mockRecordingState,
}));

const sampleTranscripts: Transcript[] = [
  {
    id: '1',
    text: 'Hello everyone, welcome to the meeting.',
    timestamp: '14:30:05',
    audio_start_time: 0,
    confidence: 0.95,
    duration: 3.2,
  },
  {
    id: '2',
    text: 'Let us discuss the agenda for today.',
    timestamp: '14:30:10',
    audio_start_time: 5,
    confidence: 0.88,
    duration: 2.8,
  },
];

// Helper to wrap component with TooltipProvider (needed when transcripts are rendered)
const renderWithTooltip = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

describe('TranscriptView', () => {
  it('renders the welcome message when no transcripts and not recording', () => {
    render(<TranscriptView transcripts={[]} />);
    expect(screen.getByText('Welcome to IQ:capture!')).toBeInTheDocument();
    expect(screen.getByText('Start recording to see live transcription')).toBeInTheDocument();
  });

  it('renders transcript text', () => {
    renderWithTooltip(<TranscriptView transcripts={sampleTranscripts} />);
    // Each transcript renders twice (hidden sizer + visible text), so use getAllByText
    expect(screen.getAllByText('Hello everyone, welcome to the meeting.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Let us discuss the agenda for today.').length).toBeGreaterThanOrEqual(1);
  });

  it('renders timestamps from audio_start_time', () => {
    renderWithTooltip(<TranscriptView transcripts={sampleTranscripts} />);
    // audio_start_time 0 => [00:00], audio_start_time 5 => [00:05]
    expect(screen.getByText('[00:00]')).toBeInTheDocument();
    expect(screen.getByText('[00:05]')).toBeInTheDocument();
  });

  it('falls back to timestamp when audio_start_time is undefined', () => {
    const transcripts = [
      { id: '1', text: 'Test', timestamp: '14:30:05' },
    ];
    renderWithTooltip(<TranscriptView transcripts={transcripts} />);
    expect(screen.getByText('14:30:05')).toBeInTheDocument();
  });

  it('shows "Listening for speech..." when recording and no transcripts', () => {
    render(<TranscriptView transcripts={[]} isRecording={true} />);
    expect(screen.getByText('Listening for speech...')).toBeInTheDocument();
  });

  it('shows "Recording paused" when paused and no transcripts', () => {
    render(<TranscriptView transcripts={[]} isRecording={true} isPaused={true} />);
    expect(screen.getByText('Recording paused')).toBeInTheDocument();
  });

  it('shows resume instruction when paused with no transcripts', () => {
    render(<TranscriptView transcripts={[]} isRecording={true} isPaused={true} />);
    expect(screen.getByText('Click resume to continue recording')).toBeInTheDocument();
  });

  it('shows "Listening..." indicator when recording with transcripts', () => {
    renderWithTooltip(<TranscriptView transcripts={sampleTranscripts} isRecording={true} />);
    expect(screen.getByText('Listening...')).toBeInTheDocument();
  });

  it('hides "Listening..." when paused', () => {
    renderWithTooltip(<TranscriptView transcripts={sampleTranscripts} isRecording={true} isPaused={true} />);
    expect(screen.queryByText('Listening...')).not.toBeInTheDocument();
  });

  it('hides "Listening..." when stopping', () => {
    renderWithTooltip(<TranscriptView transcripts={sampleTranscripts} isRecording={true} isStopping={true} />);
    expect(screen.queryByText('Listening...')).not.toBeInTheDocument();
  });

  it('hides "Listening..." when processing', () => {
    renderWithTooltip(<TranscriptView transcripts={sampleTranscripts} isRecording={true} isProcessing={true} />);
    expect(screen.queryByText('Listening...')).not.toBeInTheDocument();
  });

  it('shows RecordingStatusBar when recording', () => {
    renderWithTooltip(<TranscriptView transcripts={sampleTranscripts} isRecording={true} />);
    expect(screen.getByTestId('recording-status-bar')).toBeInTheDocument();
  });

  it('does not show RecordingStatusBar when not recording', () => {
    renderWithTooltip(<TranscriptView transcripts={sampleTranscripts} isRecording={false} />);
    expect(screen.queryByTestId('recording-status-bar')).not.toBeInTheDocument();
  });

  it('shows [Silence] for empty transcript text', () => {
    const transcripts = [{ id: '1', text: '   ', timestamp: '14:30:05', audio_start_time: 0 }];
    renderWithTooltip(<TranscriptView transcripts={transcripts} />);
    // Rendered twice (hidden sizer + visible), so use getAllByText
    expect(screen.getAllByText('[Silence]').length).toBeGreaterThanOrEqual(1);
  });

  it('cleans up filler words from transcript text', () => {
    const transcripts = [{ id: '1', text: 'uh um hello there', timestamp: '14:30:05', audio_start_time: 0 }];
    renderWithTooltip(<TranscriptView transcripts={transcripts} />);
    // Rendered twice (hidden sizer + visible), so use getAllByText
    expect(screen.getAllByText('hello there').length).toBeGreaterThanOrEqual(1);
  });

  it('cleans repetitions from transcript text', () => {
    const transcripts = [{ id: '1', text: 'I I I went to the store', timestamp: '14:30:05', audio_start_time: 0 }];
    renderWithTooltip(<TranscriptView transcripts={transcripts} />);
    // Rendered twice (hidden sizer + visible), so use getAllByText
    expect(screen.getAllByText('I went to the store').length).toBeGreaterThanOrEqual(1);
  });
});
