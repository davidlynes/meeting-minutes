import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PermissionWarning } from './PermissionWarning';

// Mock the usePlatform hooks
let mockIsLinux = false;
vi.mock('@/hooks/usePlatform', () => ({
  useIsLinux: () => mockIsLinux,
  usePlatform: () => mockIsLinux ? 'linux' : 'windows',
}));

describe('PermissionWarning', () => {
  const defaultProps = {
    hasMicrophone: false,
    hasSystemAudio: false,
    onRecheck: vi.fn(),
    isRechecking: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLinux = false;
  });

  it('renders nothing when both permissions are granted', () => {
    const { container } = render(
      <PermissionWarning {...defaultProps} hasMicrophone={true} hasSystemAudio={true} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing on Linux', () => {
    mockIsLinux = true;
    const { container } = render(<PermissionWarning {...defaultProps} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows "Permissions Required" when both are missing', () => {
    render(<PermissionWarning {...defaultProps} />);
    expect(screen.getByText('Permissions Required')).toBeInTheDocument();
  });

  it('shows "Microphone Permission Required" when only mic is missing', () => {
    render(<PermissionWarning {...defaultProps} hasMicrophone={false} hasSystemAudio={true} />);
    expect(screen.getByText('Microphone Permission Required')).toBeInTheDocument();
  });

  it('shows "System Audio Permission Required" when only system audio is missing', () => {
    render(<PermissionWarning {...defaultProps} hasMicrophone={true} hasSystemAudio={false} />);
    expect(screen.getByText('System Audio Permission Required')).toBeInTheDocument();
  });

  it('shows microphone help text when mic permission is missing', () => {
    render(<PermissionWarning {...defaultProps} hasMicrophone={false} hasSystemAudio={true} />);
    expect(screen.getByText(/needs access to your microphone/)).toBeInTheDocument();
  });

  it('shows system audio help text when system audio is missing', () => {
    render(<PermissionWarning {...defaultProps} hasMicrophone={true} hasSystemAudio={false} />);
    expect(screen.getByText(/System audio capture is not available/)).toBeInTheDocument();
  });

  it('renders the Recheck button', () => {
    render(<PermissionWarning {...defaultProps} />);
    expect(screen.getByText('Recheck')).toBeInTheDocument();
  });

  it('calls onRecheck when Recheck button is clicked', () => {
    const onRecheck = vi.fn();
    render(<PermissionWarning {...defaultProps} onRecheck={onRecheck} />);
    fireEvent.click(screen.getByText('Recheck'));
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  it('disables Recheck button when isRechecking is true', () => {
    render(<PermissionWarning {...defaultProps} isRechecking={true} />);
    const recheckButton = screen.getByText('Recheck').closest('button');
    expect(recheckButton).toBeDisabled();
  });

  it('shows spinning animation on recheck icon when rechecking', () => {
    const { container } = render(<PermissionWarning {...defaultProps} isRechecking={true} />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows microphone checklist items', () => {
    render(<PermissionWarning {...defaultProps} hasMicrophone={false} />);
    expect(screen.getByText('Your microphone is connected and powered on')).toBeInTheDocument();
    expect(screen.getByText('Microphone permission is granted in System Settings')).toBeInTheDocument();
  });
});
