import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MessageToast } from './MessageToast';

describe('MessageToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the message when show is true', () => {
    render(<MessageToast message="Success!" type="success" show={true} setShow={vi.fn()} />);
    expect(screen.getByText('Success!')).toBeInTheDocument();
  });

  it('does not render when show is false', () => {
    render(<MessageToast message="Hidden" type="success" show={false} setShow={vi.fn()} />);
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('applies green text color for success type', () => {
    render(<MessageToast message="Done" type="success" show={true} setShow={vi.fn()} />);
    expect(screen.getByText('Done')).toHaveClass('text-green-500');
  });

  it('applies red text color for error type', () => {
    render(<MessageToast message="Failed" type="error" show={true} setShow={vi.fn()} />);
    expect(screen.getByText('Failed')).toHaveClass('text-red-500');
  });

  it('auto-hides after 3 seconds', () => {
    const setShow = vi.fn();
    render(<MessageToast message="Auto-hide" type="success" show={true} setShow={setShow} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(setShow).toHaveBeenCalledWith(false);
  });

  it('does not call setShow before 3 seconds', () => {
    const setShow = vi.fn();
    render(<MessageToast message="Waiting" type="success" show={true} setShow={setShow} />);

    act(() => {
      vi.advanceTimersByTime(2999);
    });

    expect(setShow).not.toHaveBeenCalled();
  });

  it('cleans up timer on unmount', () => {
    const setShow = vi.fn();
    const { unmount } = render(<MessageToast message="Cleanup" type="success" show={true} setShow={setShow} />);
    unmount();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // setShow should not be called after unmount
    expect(setShow).not.toHaveBeenCalled();
  });

  it('renders as a span element', () => {
    const { container } = render(<MessageToast message="Span" type="success" show={true} setShow={vi.fn()} />);
    const span = container.querySelector('span');
    expect(span).toBeInTheDocument();
    expect(span).toHaveTextContent('Span');
  });
});
