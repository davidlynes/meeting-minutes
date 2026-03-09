import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecordingStatusBar } from './RecordingStatusBar';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock the RecordingStateContext
const mockRecordingState = {
  activeDuration: 0,
  isRecording: true,
  isPaused: false,
  isActive: true,
  recordingDuration: null,
  status: 'recording',
  setStatus: vi.fn(),
  isStopping: false,
  isProcessing: false,
  isSaving: false,
};

vi.mock('@/contexts/RecordingStateContext', () => ({
  useRecordingState: () => mockRecordingState,
}));

describe('RecordingStatusBar', () => {
  it('renders "Recording" text when not paused', () => {
    render(<RecordingStatusBar />);
    expect(screen.getByText(/Recording/)).toBeInTheDocument();
  });

  it('renders "Paused" text when isPaused is true', () => {
    render(<RecordingStatusBar isPaused={true} />);
    expect(screen.getByText(/Paused/)).toBeInTheDocument();
  });

  it('formats duration as 00:00 for zero seconds', () => {
    mockRecordingState.activeDuration = 0;
    render(<RecordingStatusBar />);
    expect(screen.getByText(/00:00/)).toBeInTheDocument();
  });

  it('formats duration correctly for 65 seconds', () => {
    mockRecordingState.activeDuration = 65;
    render(<RecordingStatusBar />);
    expect(screen.getByText(/01:05/)).toBeInTheDocument();
  });

  it('formats duration correctly for 3661 seconds', () => {
    mockRecordingState.activeDuration = 3661;
    render(<RecordingStatusBar />);
    // 3661 / 60 = 61 minutes, 1 second => "61:01"
    expect(screen.getByText(/61:01/)).toBeInTheDocument();
  });

  it('shows red pulsing dot when recording', () => {
    const { container } = render(<RecordingStatusBar />);
    const dot = container.querySelector('.bg-red-500.animate-pulse');
    expect(dot).toBeInTheDocument();
  });

  it('shows orange non-pulsing dot when paused', () => {
    const { container } = render(<RecordingStatusBar isPaused={true} />);
    const dot = container.querySelector('.bg-orange-500');
    expect(dot).toBeInTheDocument();
    expect(dot).not.toHaveClass('animate-pulse');
  });

  it('applies orange text color when paused', () => {
    render(<RecordingStatusBar isPaused={true} />);
    const text = screen.getByText(/Paused/);
    expect(text).toHaveClass('text-orange-700');
  });

  it('applies gray text color when recording', () => {
    render(<RecordingStatusBar />);
    const text = screen.getByText(/Recording/);
    expect(text).toHaveClass('text-gray-700');
  });

  it('handles null activeDuration gracefully', () => {
    mockRecordingState.activeDuration = null as any;
    render(<RecordingStatusBar />);
    // Should still render without crashing, showing 00:00
    expect(screen.getByText(/00:00/)).toBeInTheDocument();
  });
});
