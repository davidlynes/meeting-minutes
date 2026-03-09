import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeviceSelection, AudioDevice } from './DeviceSelection';
import { invoke } from '@tauri-apps/api/core';

// Mock child components
vi.mock('./AudioLevelMeter', () => ({
  AudioLevelMeter: ({ deviceName }: any) => <div data-testid={`audio-meter-${deviceName}`}>Meter</div>,
  CompactAudioLevelMeter: () => <div data-testid="compact-meter">Compact</div>,
}));

vi.mock('./AudioBackendSelector', () => ({
  AudioBackendSelector: () => <div data-testid="audio-backend-selector">Backend Selector</div>,
}));

vi.mock('@/lib/analytics', () => ({
  default: {
    track: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockDevices: AudioDevice[] = [
  { name: 'Built-in Microphone', device_type: 'Input' },
  { name: 'External Mic', device_type: 'Input' },
  { name: 'Speakers', device_type: 'Output' },
  { name: 'HDMI Output', device_type: 'Output' },
];

describe('DeviceSelection', () => {
  const defaultProps = {
    selectedDevices: { micDevice: null, systemDevice: null },
    onDeviceChange: vi.fn(),
    disabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue(mockDevices);
  });

  it('shows loading state initially', () => {
    // Make invoke hang so loading state persists
    vi.mocked(invoke).mockReturnValue(new Promise(() => {}));
    const { container } = render(<DeviceSelection {...defaultProps} />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders "Audio Devices" heading after loading', async () => {
    render(<DeviceSelection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Audio Devices')).toBeInTheDocument();
    });
  });

  it('renders Microphone label', async () => {
    render(<DeviceSelection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Microphone')).toBeInTheDocument();
    });
  });

  it('renders System Audio label', async () => {
    render(<DeviceSelection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('System Audio')).toBeInTheDocument();
    });
  });

  it('calls invoke with get_audio_devices on mount', async () => {
    render(<DeviceSelection {...defaultProps} />);
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('get_audio_devices');
    });
  });

  it('shows error state when device fetch fails', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Device error'));
    render(<DeviceSelection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load audio devices/)).toBeInTheDocument();
    });
  });

  it('renders info text about microphone', async () => {
    render(<DeviceSelection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Records your voice and ambient sound/)).toBeInTheDocument();
    });
  });

  it('renders info text about system audio', async () => {
    render(<DeviceSelection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Records computer audio/)).toBeInTheDocument();
    });
  });

  it('shows "no microphone devices found" when input list is empty', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([
      { name: 'Speakers', device_type: 'Output' },
    ]);
    render(<DeviceSelection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('No microphone devices found')).toBeInTheDocument();
    });
  });

  it('shows "no system audio devices found" when output list is empty', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([
      { name: 'Built-in Microphone', device_type: 'Input' },
    ]);
    render(<DeviceSelection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('No system audio devices found')).toBeInTheDocument();
    });
  });

  it('renders the AudioBackendSelector when not disabled', async () => {
    render(<DeviceSelection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('audio-backend-selector')).toBeInTheDocument();
    });
  });

  it('does not render AudioBackendSelector when disabled', async () => {
    render(<DeviceSelection {...defaultProps} disabled={true} />);
    await waitFor(() => {
      expect(screen.queryByTestId('audio-backend-selector')).not.toBeInTheDocument();
    });
  });
});
