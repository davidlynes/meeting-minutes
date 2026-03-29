import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { RecordingPostProcessingProvider } from './RecordingPostProcessingProvider';
import { listen } from '@tauri-apps/api/event';

// Mock useRecordingStop
const mockHandleRecordingStop = vi.fn();
vi.mock('@/hooks/useRecordingStop', () => ({
  useRecordingStop: vi.fn(() => ({
    handleRecordingStop: mockHandleRecordingStop,
    isStopping: false,
    isProcessingTranscript: false,
    isSavingTranscript: false,
    summaryStatus: 'idle' as const,
    setIsStopping: vi.fn(),
  })),
}));

describe('RecordingPostProcessingProvider', () => {
  let capturedListenCallback: ((event: any) => void) | null = null;
  const mockUnlisten = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    capturedListenCallback = null;

    vi.mocked(listen).mockImplementation(async (eventName: string, callback: any) => {
      if (eventName === 'recording-stop-complete') {
        capturedListenCallback = callback;
      }
      return mockUnlisten;
    });
  });

  it('renders children', () => {
    const { getByText } = render(
      <RecordingPostProcessingProvider>
        <div>Test Child</div>
      </RecordingPostProcessingProvider>
    );

    expect(getByText('Test Child')).toBeInTheDocument();
  });

  it('sets up recording-stop-complete event listener', async () => {
    render(
      <RecordingPostProcessingProvider>
        <div>Child</div>
      </RecordingPostProcessingProvider>
    );

    await waitFor(() => {
      expect(listen).toHaveBeenCalledWith('recording-stop-complete', expect.any(Function));
    });
  });

  it('calls handleRecordingStop when event fires with true payload', async () => {
    render(
      <RecordingPostProcessingProvider>
        <div>Child</div>
      </RecordingPostProcessingProvider>
    );

    await waitFor(() => {
      expect(capturedListenCallback).not.toBeNull();
    });

    capturedListenCallback!({ payload: true });

    expect(mockHandleRecordingStop).toHaveBeenCalledWith(true);
  });

  it('calls handleRecordingStop with false payload', async () => {
    render(
      <RecordingPostProcessingProvider>
        <div>Child</div>
      </RecordingPostProcessingProvider>
    );

    await waitFor(() => {
      expect(capturedListenCallback).not.toBeNull();
    });

    capturedListenCallback!({ payload: false });

    expect(mockHandleRecordingStop).toHaveBeenCalledWith(false);
  });

  it('cleans up listener on unmount', async () => {
    const { unmount } = render(
      <RecordingPostProcessingProvider>
        <div>Child</div>
      </RecordingPostProcessingProvider>
    );

    await waitFor(() => {
      expect(listen).toHaveBeenCalled();
    });

    unmount();

    expect(mockUnlisten).toHaveBeenCalled();
  });
});
