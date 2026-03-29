import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { SidebarProvider, useSidebar } from './SidebarProvider';
import { invoke } from '@tauri-apps/api/core';

// Mock RecordingStateContext
const mockRecordingState = {
  isRecording: false,
  isPaused: false,
  isActive: false,
  recordingDuration: null,
  activeDuration: null,
  status: 'idle',
  setStatus: vi.fn(),
  isStopping: false,
  isProcessing: false,
  isSaving: false,
};

vi.mock('@/contexts/RecordingStateContext', () => ({
  useRecordingState: () => mockRecordingState,
}));

vi.mock('@/lib/analytics', () => ({
  default: {
    track: vi.fn().mockResolvedValue(undefined),
    trackButtonClick: vi.fn().mockResolvedValue(undefined),
    trackBackendConnection: vi.fn(),
  },
}));

// Test consumer component to access context
function TestConsumer() {
  const sidebar = useSidebar();
  return (
    <div>
      <span data-testid="current-meeting">{sidebar.currentMeeting?.title || 'none'}</span>
      <span data-testid="is-collapsed">{sidebar.isCollapsed.toString()}</span>
      <span data-testid="meeting-count">{sidebar.meetings.length}</span>
      <span data-testid="is-meeting-active">{sidebar.isMeetingActive.toString()}</span>
      <span data-testid="server-address">{sidebar.serverAddress}</span>
      <span data-testid="is-searching">{sidebar.isSearching.toString()}</span>
      <span data-testid="search-results-count">{sidebar.searchResults.length}</span>
      <button data-testid="toggle-collapse" onClick={sidebar.toggleCollapse}>Toggle</button>
      <button data-testid="set-meeting" onClick={() => sidebar.setCurrentMeeting({ id: 'test-1', title: 'Test Meeting' })}>Set Meeting</button>
      <button data-testid="set-meetings" onClick={() => sidebar.setMeetings([{ id: 'm1', title: 'Meeting 1' }, { id: 'm2', title: 'Meeting 2' }])}>Set Meetings</button>
      <button data-testid="set-active" onClick={() => sidebar.setIsMeetingActive(true)}>Set Active</button>
      <button data-testid="recording-toggle" onClick={sidebar.handleRecordingToggle}>Toggle Recording</button>
      <button data-testid="refetch" onClick={sidebar.refetchMeetings}>Refetch</button>
    </div>
  );
}

describe('SidebarProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue([]);
    mockRecordingState.isRecording = false;
  });

  it('provides initial currentMeeting as "New Call"', async () => {
    render(
      <SidebarProvider>
        <TestConsumer />
      </SidebarProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('current-meeting')).toHaveTextContent('+ New Call');
    });
  });

  it('starts with sidebar collapsed', async () => {
    render(
      <SidebarProvider>
        <TestConsumer />
      </SidebarProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('is-collapsed')).toHaveTextContent('true');
    });
  });

  it('starts with empty meetings list', async () => {
    render(
      <SidebarProvider>
        <TestConsumer />
      </SidebarProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('meeting-count')).toHaveTextContent('0');
    });
  });

  it('starts with meeting not active', async () => {
    render(
      <SidebarProvider>
        <TestConsumer />
      </SidebarProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('is-meeting-active')).toHaveTextContent('false');
    });
  });

  it('toggles collapse state', async () => {
    render(
      <SidebarProvider>
        <TestConsumer />
      </SidebarProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-collapsed')).toHaveTextContent('true');
    });

    act(() => {
      screen.getByTestId('toggle-collapse').click();
    });

    expect(screen.getByTestId('is-collapsed')).toHaveTextContent('false');

    act(() => {
      screen.getByTestId('toggle-collapse').click();
    });

    expect(screen.getByTestId('is-collapsed')).toHaveTextContent('true');
  });

  it('allows setting current meeting', async () => {
    render(
      <SidebarProvider>
        <TestConsumer />
      </SidebarProvider>
    );

    act(() => {
      screen.getByTestId('set-meeting').click();
    });

    expect(screen.getByTestId('current-meeting')).toHaveTextContent('Test Meeting');
  });

  it('allows setting meetings list', async () => {
    render(
      <SidebarProvider>
        <TestConsumer />
      </SidebarProvider>
    );

    act(() => {
      screen.getByTestId('set-meetings').click();
    });

    expect(screen.getByTestId('meeting-count')).toHaveTextContent('2');
  });

  it('allows setting meeting active state', async () => {
    render(
      <SidebarProvider>
        <TestConsumer />
      </SidebarProvider>
    );

    act(() => {
      screen.getByTestId('set-active').click();
    });

    expect(screen.getByTestId('is-meeting-active')).toHaveTextContent('true');
  });

  it('sets server address on init', async () => {
    render(
      <SidebarProvider>
        <TestConsumer />
      </SidebarProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('server-address')).toHaveTextContent('http://localhost:5167');
    });
  });

  it('throws error when useSidebar is used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useSidebar must be used within a SidebarProvider');
    consoleSpy.mockRestore();
  });

  it('fetches meetings when server address is set', async () => {
    vi.mocked(invoke).mockResolvedValue([
      { id: 'api-1', title: 'API Meeting 1' },
      { id: 'api-2', title: 'API Meeting 2' },
    ]);

    render(
      <SidebarProvider>
        <TestConsumer />
      </SidebarProvider>
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('api_get_meetings');
    });

    await waitFor(() => {
      expect(screen.getByTestId('meeting-count')).toHaveTextContent('2');
    });
  });

  it('handles fetch meetings error gracefully', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Network error'));

    render(
      <SidebarProvider>
        <TestConsumer />
      </SidebarProvider>
    );

    await waitFor(() => {
      // Should still render and show 0 meetings
      expect(screen.getByTestId('meeting-count')).toHaveTextContent('0');
    });
  });

  it('renders children', () => {
    render(
      <SidebarProvider>
        <div data-testid="child">Hello</div>
      </SidebarProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
