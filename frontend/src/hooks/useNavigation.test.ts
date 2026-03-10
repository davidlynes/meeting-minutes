import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { useRouter } from 'next/navigation';

// Mock useSidebar
const mockSetCurrentMeeting = vi.fn();
vi.mock('@/components/Sidebar/SidebarProvider', () => ({
  useSidebar: () => ({
    setCurrentMeeting: mockSetCurrentMeeting,
  }),
}));

import { useNavigation } from './useNavigation';

describe('useNavigation', () => {
  let mockPush: Mock;

  beforeEach(() => {
    mockPush = vi.fn();
    (useRouter as Mock).mockReturnValue({
      push: mockPush,
      back: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      refresh: vi.fn(),
    });
    mockSetCurrentMeeting.mockClear();
  });

  // ── Return Value ───────────────────────────────────────────────────

  it('should return a function', () => {
    const { result } = renderHook(() => useNavigation('meeting-1', 'My Meeting'));

    expect(typeof result.current).toBe('function');
  });

  // ── Navigation Behavior ────────────────────────────────────────────

  it('should set current meeting and navigate on call', () => {
    const { result } = renderHook(() => useNavigation('meeting-1', 'My Meeting'));

    act(() => {
      result.current();
    });

    expect(mockSetCurrentMeeting).toHaveBeenCalledWith({
      id: 'meeting-1',
      title: 'My Meeting',
    });
    expect(mockPush).toHaveBeenCalledWith('/meeting-details?id=meeting-1');
  });

  it('should use the correct meeting ID in the URL', () => {
    const { result } = renderHook(() => useNavigation('abc-123', 'Team Standup'));

    act(() => {
      result.current();
    });

    expect(mockPush).toHaveBeenCalledWith('/meeting-details?id=abc-123');
  });

  it('should pass the meeting title to setCurrentMeeting', () => {
    const { result } = renderHook(() => useNavigation('id-42', 'Sprint Review'));

    act(() => {
      result.current();
    });

    expect(mockSetCurrentMeeting).toHaveBeenCalledWith({
      id: 'id-42',
      title: 'Sprint Review',
    });
  });

  it('should handle empty string meeting ID', () => {
    const { result } = renderHook(() => useNavigation('', ''));

    act(() => {
      result.current();
    });

    expect(mockSetCurrentMeeting).toHaveBeenCalledWith({ id: '', title: '' });
    expect(mockPush).toHaveBeenCalledWith('/meeting-details?id=');
  });

  it('should handle special characters in meeting ID', () => {
    const { result } = renderHook(() => useNavigation('meeting/special&id', 'Test'));

    act(() => {
      result.current();
    });

    expect(mockPush).toHaveBeenCalledWith('/meeting-details?id=meeting/special&id');
  });

  it('should call setCurrentMeeting before router.push', () => {
    const callOrder: string[] = [];
    mockSetCurrentMeeting.mockImplementation(() => callOrder.push('setCurrentMeeting'));
    mockPush.mockImplementation(() => callOrder.push('push'));

    const { result } = renderHook(() => useNavigation('id-1', 'Title'));

    act(() => {
      result.current();
    });

    expect(callOrder).toEqual(['setCurrentMeeting', 'push']);
  });

  // ── Multiple Navigations ───────────────────────────────────────────

  it('should allow multiple navigations with the same hook', () => {
    const { result } = renderHook(() => useNavigation('id-1', 'Title'));

    act(() => {
      result.current();
      result.current();
    });

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockSetCurrentMeeting).toHaveBeenCalledTimes(2);
  });

  // ── Re-render with new props ───────────────────────────────────────

  it('should use updated props after re-render', () => {
    const { result, rerender } = renderHook(
      ({ id, title }) => useNavigation(id, title),
      { initialProps: { id: 'old-id', title: 'Old Title' } }
    );

    rerender({ id: 'new-id', title: 'New Title' });

    act(() => {
      result.current();
    });

    expect(mockSetCurrentMeeting).toHaveBeenCalledWith({
      id: 'new-id',
      title: 'New Title',
    });
    expect(mockPush).toHaveBeenCalledWith('/meeting-details?id=new-id');
  });
});
