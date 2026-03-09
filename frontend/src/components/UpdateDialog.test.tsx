import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UpdateDialog } from './UpdateDialog';
import { UpdateInfo } from '@/services/updateService';
import { invoke } from '@tauri-apps/api/core';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockUpdateInfo: UpdateInfo = {
  available: true,
  currentVersion: '0.2.3',
  version: '0.3.0',
  date: '2025-01-15',
  body: 'Bug fixes and improvements',
  downloadUrl: 'https://example.com/download',
  whatsNew: ['New feature A', 'Improved performance', 'Bug fix for audio'],
};

describe('UpdateDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    updateInfo: mockUpdateInfo,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it('renders "Update Available" title when open', () => {
    render(<UpdateDialog {...defaultProps} />);
    expect(screen.getByText('Update Available')).toBeInTheDocument();
  });

  it('shows the new version number', () => {
    render(<UpdateDialog {...defaultProps} />);
    expect(screen.getByText('0.3.0')).toBeInTheDocument();
  });

  it('shows the current version', () => {
    render(<UpdateDialog {...defaultProps} />);
    expect(screen.getByText('0.2.3')).toBeInTheDocument();
  });

  it('shows what is new items', () => {
    render(<UpdateDialog {...defaultProps} />);
    expect(screen.getByText('New feature A')).toBeInTheDocument();
    expect(screen.getByText('Improved performance')).toBeInTheDocument();
    expect(screen.getByText('Bug fix for audio')).toBeInTheDocument();
  });

  it('renders the "Later" button', () => {
    render(<UpdateDialog {...defaultProps} />);
    expect(screen.getByText('Later')).toBeInTheDocument();
  });

  it('renders the "Download Update" button', () => {
    render(<UpdateDialog {...defaultProps} />);
    expect(screen.getByText('Download Update')).toBeInTheDocument();
  });

  it('calls onOpenChange(false) when Later is clicked', () => {
    const onOpenChange = vi.fn();
    render(<UpdateDialog {...defaultProps} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByText('Later'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('invokes open_external_url when Download is clicked', async () => {
    render(<UpdateDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('Download Update'));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('open_external_url', { url: 'https://example.com/download' });
    });
  });

  it('returns null when updateInfo is not available', () => {
    const { container } = render(
      <UpdateDialog open={true} onOpenChange={vi.fn()} updateInfo={{ available: false, currentVersion: '0.2.3' }} />
    );
    // Dialog should not render content
    expect(screen.queryByText('Update Available')).not.toBeInTheDocument();
  });

  it('returns null when updateInfo is null', () => {
    render(<UpdateDialog open={true} onOpenChange={vi.fn()} updateInfo={null} />);
    expect(screen.queryByText('Update Available')).not.toBeInTheDocument();
  });

  it('shows release date when provided', () => {
    render(<UpdateDialog {...defaultProps} />);
    // Date should be formatted by toLocaleDateString
    expect(screen.getByText('Release Date:')).toBeInTheDocument();
  });

  it('shows body text when whatsNew is empty', () => {
    const infoWithBody: UpdateInfo = {
      ...mockUpdateInfo,
      whatsNew: [],
      body: 'Release notes in body',
    };
    render(<UpdateDialog {...defaultProps} updateInfo={infoWithBody} />);
    expect(screen.getByText('Release notes in body')).toBeInTheDocument();
  });

  it('does not show Download button when downloadUrl is missing', () => {
    const infoNoUrl: UpdateInfo = {
      ...mockUpdateInfo,
      downloadUrl: undefined,
    };
    render(<UpdateDialog {...defaultProps} updateInfo={infoNoUrl} />);
    expect(screen.queryByText('Download Update')).not.toBeInTheDocument();
  });

  it('shows description with version number', () => {
    render(<UpdateDialog {...defaultProps} />);
    expect(screen.getByText(/A new version \(0\.3\.0\) is available/)).toBeInTheDocument();
  });
});
