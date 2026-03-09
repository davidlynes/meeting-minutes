import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTemplates } from './useTemplates';
import { invoke } from '@tauri-apps/api/core';

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  default: {
    trackFeatureUsed: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('useTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches templates on mount', async () => {
    const templates = [
      { id: 'standard_meeting', name: 'Standard Meeting', description: 'Default template' },
      { id: 'brainstorm', name: 'Brainstorm', description: 'For brainstorming sessions' },
    ];
    vi.mocked(invoke).mockResolvedValueOnce(templates);

    const { result } = renderHook(() => useTemplates());

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('api_list_templates');
      expect(result.current.availableTemplates).toEqual(templates);
    });
  });

  it('provides default selectedTemplate as standard_meeting', () => {
    vi.mocked(invoke).mockResolvedValue([]);
    const { result } = renderHook(() => useTemplates());

    expect(result.current.selectedTemplate).toBe('standard_meeting');
  });

  it('handles template fetch failure gracefully', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Fetch failed'));

    const { result } = renderHook(() => useTemplates());

    await waitFor(() => {
      expect(result.current.availableTemplates).toEqual([]);
    });
  });

  describe('handleTemplateSelection', () => {
    it('updates selected template and shows toast', async () => {
      vi.mocked(invoke).mockResolvedValue([]);

      const { result } = renderHook(() => useTemplates());
      const { toast } = await import('sonner');
      const Analytics = (await import('@/lib/analytics')).default;

      act(() => {
        result.current.handleTemplateSelection('brainstorm', 'Brainstorm');
      });

      expect(result.current.selectedTemplate).toBe('brainstorm');
      expect(toast.success).toHaveBeenCalledWith('Template selected', {
        description: 'Using "Brainstorm" template for summary generation',
      });
      expect(Analytics.trackFeatureUsed).toHaveBeenCalledWith('template_selected');
    });

    it('can switch between templates', async () => {
      vi.mocked(invoke).mockResolvedValue([]);

      const { result } = renderHook(() => useTemplates());

      act(() => {
        result.current.handleTemplateSelection('brainstorm', 'Brainstorm');
      });
      expect(result.current.selectedTemplate).toBe('brainstorm');

      act(() => {
        result.current.handleTemplateSelection('standup', 'Standup');
      });
      expect(result.current.selectedTemplate).toBe('standup');
    });
  });
});
