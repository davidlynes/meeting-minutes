import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AudioLevelMeter, CompactAudioLevelMeter } from './AudioLevelMeter';

describe('AudioLevelMeter', () => {
  const defaultProps = {
    rmsLevel: 0.5,
    peakLevel: 0.7,
    isActive: true,
    deviceName: 'Test Microphone',
  };

  it('renders the level percentage', () => {
    render(<AudioLevelMeter {...defaultProps} />);
    // Log-scaled: Math.round(Math.log10(0.5 * 9 + 1) * 100) = 74
    expect(screen.getByText('74%')).toBeInTheDocument();
  });

  it('shows active indicator when isActive is true', () => {
    const { container } = render(<AudioLevelMeter {...defaultProps} isActive={true} />);
    const activityDot = container.querySelector('.bg-green-400.animate-pulse');
    expect(activityDot).toBeInTheDocument();
  });

  it('shows inactive indicator when isActive is false', () => {
    const { container } = render(<AudioLevelMeter {...defaultProps} isActive={false} />);
    const inactiveDot = container.querySelector('.bg-gray-300');
    expect(inactiveDot).toBeInTheDocument();
  });

  it('renders 0% for zero rms level', () => {
    render(<AudioLevelMeter {...defaultProps} rmsLevel={0} peakLevel={0} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders 100% for max rms level', () => {
    render(<AudioLevelMeter {...defaultProps} rmsLevel={1} peakLevel={1} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('applies small size classes', () => {
    const { container } = render(<AudioLevelMeter {...defaultProps} size="small" />);
    expect(container.querySelector('.text-xs')).toBeInTheDocument();
  });

  it('applies medium size classes by default', () => {
    const { container } = render(<AudioLevelMeter {...defaultProps} />);
    expect(container.querySelector('.text-sm')).toBeInTheDocument();
  });

  it('applies large size classes', () => {
    const { container } = render(<AudioLevelMeter {...defaultProps} size="large" />);
    expect(container.querySelector('.text-base')).toBeInTheDocument();
  });

  it('clamps rmsLevel to 0-1 range', () => {
    render(<AudioLevelMeter {...defaultProps} rmsLevel={1.5} peakLevel={1.5} />);
    // Should be clamped to 1, so log10(1*9+1) = 1 => 100%
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('handles negative rmsLevel gracefully', () => {
    render(<AudioLevelMeter {...defaultProps} rmsLevel={-0.5} peakLevel={0} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('includes device name in activity indicator title', () => {
    const { container } = render(<AudioLevelMeter {...defaultProps} />);
    const dot = container.querySelector('[title="Test Microphone - Active"]');
    expect(dot).toBeInTheDocument();
  });

  it('shows inactive title when not active', () => {
    const { container } = render(<AudioLevelMeter {...defaultProps} isActive={false} />);
    const dot = container.querySelector('[title="Test Microphone - Inactive"]');
    expect(dot).toBeInTheDocument();
  });
});

describe('CompactAudioLevelMeter', () => {
  it('renders active indicator when isActive', () => {
    const { container } = render(
      <CompactAudioLevelMeter rmsLevel={0.5} peakLevel={0.7} isActive={true} />
    );
    expect(container.querySelector('.bg-green-400')).toBeInTheDocument();
  });

  it('renders inactive indicator when not active', () => {
    const { container } = render(
      <CompactAudioLevelMeter rmsLevel={0.5} peakLevel={0.7} isActive={false} />
    );
    expect(container.querySelector('.bg-gray-300')).toBeInTheDocument();
  });

  it('renders the mini meter bar', () => {
    const { container } = render(
      <CompactAudioLevelMeter rmsLevel={0.5} peakLevel={0.7} isActive={true} />
    );
    const meterBar = container.querySelector('.w-8');
    expect(meterBar).toBeInTheDocument();
  });

  it('handles zero level', () => {
    const { container } = render(
      <CompactAudioLevelMeter rmsLevel={0} peakLevel={0} isActive={false} />
    );
    // Should render without error
    expect(container.firstChild).toBeInTheDocument();
  });
});
