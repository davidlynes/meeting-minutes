import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { About } from './About';

// Mock child components and services
vi.mock('./AnalyticsConsentSwitch', () => ({
  default: () => <div data-testid="analytics-consent-switch">Analytics Switch</div>,
}));

vi.mock('./UpdateDialog', () => ({
  UpdateDialog: ({ open, updateInfo }: any) => (
    open ? <div data-testid="update-dialog">Update Dialog - {updateInfo?.version}</div> : null
  ),
}));

vi.mock('@/services/updateService', () => ({
  updateService: {
    checkForUpdates: vi.fn(),
  },
  UpdateInfo: {},
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: any) => <img alt={alt} {...props} />,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('About', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the app tagline', async () => {
    render(<About />);
    await waitFor(() => {
      expect(screen.getByText(/Real-time notes and summaries/)).toBeInTheDocument();
    });
  });

  it('displays the version number', async () => {
    render(<About />);
    await waitFor(() => {
      expect(screen.getByText(/v0\.2\.3/)).toBeInTheDocument();
    });
  });

  it('renders the logo image', () => {
    render(<About />);
    const logo = screen.getByAltText('IQ:capture Logo');
    expect(logo).toBeInTheDocument();
  });

  it('renders the Check for Updates button', () => {
    render(<About />);
    expect(screen.getByText('Check for Updates')).toBeInTheDocument();
  });

  it('renders feature descriptions', () => {
    render(<About />);
    expect(screen.getByText('Privacy-first')).toBeInTheDocument();
    expect(screen.getByText('Use Any Model')).toBeInTheDocument();
    expect(screen.getByText('Cost-Smart')).toBeInTheDocument();
    expect(screen.getByText('Works everywhere')).toBeInTheDocument();
  });

  it('renders the Contact Support button', () => {
    render(<About />);
    expect(screen.getByText('Contact Support')).toBeInTheDocument();
  });

  it('renders the footer with company name', () => {
    render(<About />);
    expect(screen.getByText('Unique IQ')).toBeInTheDocument();
  });

  it('renders the analytics consent switch', () => {
    render(<About />);
    expect(screen.getByTestId('analytics-consent-switch')).toBeInTheDocument();
  });

  it('renders the coming soon section', () => {
    render(<About />);
    expect(screen.getByText('Coming soon:')).toBeInTheDocument();
  });
});
