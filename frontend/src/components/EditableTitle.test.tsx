import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditableTitle } from './EditableTitle';

describe('EditableTitle', () => {
  const defaultProps = {
    title: 'Test Meeting',
    isEditing: false,
    onStartEditing: vi.fn(),
    onFinishEditing: vi.fn(),
    onChange: vi.fn(),
  };

  it('renders the title text when not editing', () => {
    render(<EditableTitle {...defaultProps} />);
    expect(screen.getByText('Test Meeting')).toBeInTheDocument();
  });

  it('renders as an h1 heading when not editing', () => {
    render(<EditableTitle {...defaultProps} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test Meeting');
  });

  it('calls onStartEditing when title is clicked', () => {
    const onStartEditing = vi.fn();
    render(<EditableTitle {...defaultProps} onStartEditing={onStartEditing} />);
    fireEvent.click(screen.getByText('Test Meeting'));
    expect(onStartEditing).toHaveBeenCalledTimes(1);
  });

  it('renders a textarea when in editing mode', () => {
    render(<EditableTitle {...defaultProps} isEditing={true} />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('Test Meeting');
  });

  it('textarea has autoFocus when editing', () => {
    render(<EditableTitle {...defaultProps} isEditing={true} />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveFocus();
  });

  it('calls onChange when textarea value changes', () => {
    const onChange = vi.fn();
    render(<EditableTitle {...defaultProps} isEditing={true} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Updated Title' } });
    expect(onChange).toHaveBeenCalledWith('Updated Title');
  });

  it('calls onFinishEditing on Enter key without Shift', () => {
    const onFinishEditing = vi.fn();
    render(<EditableTitle {...defaultProps} isEditing={true} onFinishEditing={onFinishEditing} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: false });
    expect(onFinishEditing).toHaveBeenCalled();
  });

  it('does not call onFinishEditing on Shift+Enter', () => {
    const onFinishEditing = vi.fn();
    render(<EditableTitle {...defaultProps} isEditing={true} onFinishEditing={onFinishEditing} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: true });
    expect(onFinishEditing).not.toHaveBeenCalled();
  });

  it('calls onFinishEditing on blur', () => {
    const onFinishEditing = vi.fn();
    render(<EditableTitle {...defaultProps} isEditing={true} onFinishEditing={onFinishEditing} />);
    fireEvent.blur(screen.getByRole('textbox'));
    expect(onFinishEditing).toHaveBeenCalled();
  });

  it('shows edit button that calls onStartEditing', () => {
    const onStartEditing = vi.fn();
    render(<EditableTitle {...defaultProps} onStartEditing={onStartEditing} />);
    const editButton = screen.getByTitle('Edit section title');
    fireEvent.click(editButton);
    expect(onStartEditing).toHaveBeenCalled();
  });

  it('shows delete button when onDelete is provided', () => {
    const onDelete = vi.fn();
    render(<EditableTitle {...defaultProps} onDelete={onDelete} />);
    const deleteButton = screen.getByTitle('Delete section');
    expect(deleteButton).toBeInTheDocument();
  });

  it('does not show delete button when onDelete is not provided', () => {
    render(<EditableTitle {...defaultProps} />);
    expect(screen.queryByTitle('Delete section')).not.toBeInTheDocument();
  });

  it('calls onDelete when delete button is clicked', () => {
    const onDelete = vi.fn();
    render(<EditableTitle {...defaultProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByTitle('Delete section'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
