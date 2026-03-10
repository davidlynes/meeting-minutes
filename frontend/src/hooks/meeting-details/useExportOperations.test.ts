import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useExportOperations } from './useExportOperations';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';

// Mock dependencies
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/docxExport', () => ({
  generateDocxFromMarkdown: vi.fn().mockResolvedValue(new Uint8Array([0x50, 0x4B, 0x03, 0x04])),
}));

vi.mock('@/lib/pdfExport', () => ({
  generatePdfFromMarkdown: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
}));

// Mock @tauri-apps/plugin-store for this file
vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  }),
  loadStore: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  }),
}));

const mockMeeting = {
  id: 'meeting-1',
  title: 'Test Meeting',
  created_at: '2025-01-01T12:00:00Z',
};

const defaultProps = {
  meeting: mockMeeting,
  meetingTitle: 'Test Meeting',
  aiSummary: { markdown: '# Summary\nContent' } as any,
  blockNoteSummaryRef: { current: null } as any,
};

describe('useExportOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default invoke mock
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'api_list_brand_templates') return [];
      if (cmd === 'api_get_brand_template') return null;
      if (cmd === 'api_get_brand_template_logo') return null;
      if (cmd === 'write_bytes_to_file') return undefined;
      return undefined;
    });
  });

  it('returns export handlers and brand state', () => {
    const { result } = renderHook(() => useExportOperations(defaultProps));

    expect(result.current.handleExportWord).toBeDefined();
    expect(result.current.handleExportPdf).toBeDefined();
    expect(result.current.selectedBrandId).toBe('iq-standard');
    expect(result.current.brandTemplates).toEqual([]);
  });

  describe('handleExportWord', () => {
    it('shows error when no summary content', async () => {
      const props = { ...defaultProps, aiSummary: null };
      const { result } = renderHook(() => useExportOperations(props));
      const { toast } = await import('sonner');

      await act(async () => {
        await result.current.handleExportWord();
      });

      expect(toast.error).toHaveBeenCalledWith('No summary content available to export');
    });

    it('does nothing when user cancels save dialog', async () => {
      vi.mocked(save).mockResolvedValueOnce(null);

      const { result } = renderHook(() => useExportOperations(defaultProps));

      await act(async () => {
        await result.current.handleExportWord();
      });

      expect(invoke).not.toHaveBeenCalledWith('write_bytes_to_file', expect.any(Object));
    });

    it('writes docx file when save path selected', async () => {
      vi.mocked(save).mockResolvedValueOnce('/path/to/output.docx');

      const { result } = renderHook(() => useExportOperations(defaultProps));
      const { toast } = await import('sonner');

      await act(async () => {
        await result.current.handleExportWord();
      });

      expect(invoke).toHaveBeenCalledWith('write_bytes_to_file', expect.objectContaining({
        path: '/path/to/output.docx',
      }));
      expect(toast.success).toHaveBeenCalledWith('Word document exported successfully');
    });
  });

  describe('handleExportPdf', () => {
    it('shows error when no summary content', async () => {
      const props = { ...defaultProps, aiSummary: null };
      const { result } = renderHook(() => useExportOperations(props));
      const { toast } = await import('sonner');

      await act(async () => {
        await result.current.handleExportPdf();
      });

      expect(toast.error).toHaveBeenCalledWith('No summary content available to export');
    });

    it('writes pdf file when save path selected', async () => {
      vi.mocked(save).mockResolvedValueOnce('/path/to/output.pdf');

      const { result } = renderHook(() => useExportOperations(defaultProps));
      const { toast } = await import('sonner');

      await act(async () => {
        await result.current.handleExportPdf();
      });

      expect(invoke).toHaveBeenCalledWith('write_bytes_to_file', expect.objectContaining({
        path: '/path/to/output.pdf',
      }));
      expect(toast.success).toHaveBeenCalledWith('PDF document exported successfully');
    });
  });

  describe('brand selection', () => {
    it('setSelectedBrandId updates the brand', async () => {
      const { result } = renderHook(() => useExportOperations(defaultProps));

      await act(async () => {
        await result.current.setSelectedBrandId('custom-brand');
      });

      expect(result.current.selectedBrandId).toBe('custom-brand');
    });

    it('refreshBrandTemplates fetches updated list', async () => {
      const templates = [{ id: 'brand-1', name: 'Brand 1', is_bundled: true }];
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'api_list_brand_templates') return templates;
        return undefined;
      });

      const { result } = renderHook(() => useExportOperations(defaultProps));

      await act(async () => {
        await result.current.refreshBrandTemplates();
      });

      await waitFor(() => {
        expect(result.current.brandTemplates).toEqual(templates);
      });
    });
  });
});
