import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfidenceIndicator } from './ConfidenceIndicator';

describe('ConfidenceIndicator', () => {
  it('renders a status indicator for high confidence', () => {
    render(<ConfidenceIndicator confidence={0.95} />);
    const indicator = screen.getByRole('status');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveClass('bg-green-500');
  });

  it('renders green for confidence >= 0.8', () => {
    render(<ConfidenceIndicator confidence={0.8} />);
    expect(screen.getByRole('status')).toHaveClass('bg-green-500');
  });

  it('renders yellow for confidence >= 0.7 and < 0.8', () => {
    render(<ConfidenceIndicator confidence={0.75} />);
    expect(screen.getByRole('status')).toHaveClass('bg-yellow-500');
  });

  it('renders orange for confidence >= 0.4 and < 0.7', () => {
    render(<ConfidenceIndicator confidence={0.5} />);
    expect(screen.getByRole('status')).toHaveClass('bg-orange-500');
  });

  it('renders red for confidence < 0.4', () => {
    render(<ConfidenceIndicator confidence={0.2} />);
    expect(screen.getByRole('status')).toHaveClass('bg-red-500');
  });

  it('displays correct percentage in title', () => {
    const { container } = render(<ConfidenceIndicator confidence={0.85} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute('title', '85% confidence - High confidence');
  });

  it('displays correct aria-label', () => {
    const { container } = render(<ConfidenceIndicator confidence={0.72} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute('aria-label', 'Transcription confidence: 72%');
  });

  it('returns null when showIndicator is false', () => {
    const { container } = render(<ConfidenceIndicator confidence={0.9} showIndicator={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders by default when showIndicator is not provided', () => {
    render(<ConfidenceIndicator confidence={0.9} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('handles confidence of exactly 0', () => {
    render(<ConfidenceIndicator confidence={0} />);
    expect(screen.getByRole('status')).toHaveClass('bg-red-500');
  });

  it('handles confidence of exactly 1', () => {
    render(<ConfidenceIndicator confidence={1} />);
    expect(screen.getByRole('status')).toHaveClass('bg-green-500');
  });

  it('shows "Low confidence" label for very low values', () => {
    const { container } = render(<ConfidenceIndicator confidence={0.1} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('title')).toContain('Low confidence');
  });

  it('shows "Medium confidence" label for mid values', () => {
    const { container } = render(<ConfidenceIndicator confidence={0.55} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('title')).toContain('Medium confidence');
  });

  it('shows "Good confidence" label for 0.7 range', () => {
    const { container } = render(<ConfidenceIndicator confidence={0.7} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('title')).toContain('Good confidence');
  });
});
