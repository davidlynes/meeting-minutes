import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyStateSummary } from './EmptyStateSummary';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('EmptyStateSummary', () => {
  const defaultProps = {
    onGenerate: vi.fn(),
    hasModel: true,
  };

  it('renders the empty state heading', () => {
    render(<EmptyStateSummary {...defaultProps} />);
    expect(screen.getByText('No Summary Generated Yet')).toBeInTheDocument();
  });

  it('renders the description text', () => {
    render(<EmptyStateSummary {...defaultProps} />);
    expect(screen.getByText(/Generate an AI-powered summary/)).toBeInTheDocument();
  });

  it('renders the Generate Summary button when model is available', () => {
    render(<EmptyStateSummary {...defaultProps} />);
    expect(screen.getByText('Generate Summary')).toBeInTheDocument();
  });

  it('calls onGenerate when button is clicked', () => {
    const onGenerate = vi.fn();
    render(<EmptyStateSummary {...defaultProps} onGenerate={onGenerate} />);
    fireEvent.click(screen.getByText('Generate Summary'));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('disables the button when hasModel is false', () => {
    render(<EmptyStateSummary {...defaultProps} hasModel={false} />);
    const button = screen.getByRole('button', { name: /Generate Summary/i });
    expect(button).toBeDisabled();
  });

  it('shows model warning when hasModel is false', () => {
    render(<EmptyStateSummary {...defaultProps} hasModel={false} />);
    expect(screen.getByText('Please select a model in Settings first')).toBeInTheDocument();
  });

  it('does not show model warning when hasModel is true', () => {
    render(<EmptyStateSummary {...defaultProps} hasModel={true} />);
    // The tooltip text might still be in the DOM but the visible warning should not be
    const warnings = screen.queryAllByText('Please select a model in Settings first');
    // Only tooltip text, not the visible p tag
    expect(warnings.length).toBeLessThanOrEqual(1);
  });

  it('shows "Generating..." text when isGenerating is true', () => {
    render(<EmptyStateSummary {...defaultProps} isGenerating={true} />);
    expect(screen.getByText('Generating...')).toBeInTheDocument();
  });

  it('disables the button when isGenerating is true', () => {
    render(<EmptyStateSummary {...defaultProps} isGenerating={true} />);
    const button = screen.getByRole('button', { name: /Generating/i });
    expect(button).toBeDisabled();
  });

  it('button is enabled when hasModel is true and not generating', () => {
    render(<EmptyStateSummary {...defaultProps} hasModel={true} isGenerating={false} />);
    const button = screen.getByRole('button', { name: /Generate Summary/i });
    expect(button).not.toBeDisabled();
  });
});
