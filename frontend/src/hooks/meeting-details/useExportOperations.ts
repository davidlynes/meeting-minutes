import { useCallback, useState, useEffect, RefObject } from 'react';
import { Summary } from '@/types';
import { BlockNoteSummaryViewRef } from '@/components/AISummary/BlockNoteSummaryView';
import { toast } from 'sonner';
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { generateDocxFromMarkdown, BrandTemplate } from '@/lib/docxExport';
import { load as loadStore } from '@tauri-apps/plugin-store';

interface UseExportOperationsProps {
  meeting: any;
  meetingTitle: string;
  aiSummary: Summary | null;
  blockNoteSummaryRef: RefObject<BlockNoteSummaryViewRef>;
}

export interface BrandTemplateInfo {
  id: string;
  name: string;
  is_bundled: boolean;
}

export function useExportOperations({
  meeting,
  meetingTitle,
  aiSummary,
  blockNoteSummaryRef,
}: UseExportOperationsProps) {

  const [selectedBrandId, setSelectedBrandId] = useState<string>('iq-standard');
  const [brandTemplates, setBrandTemplates] = useState<BrandTemplateInfo[]>([]);

  // Load persisted brand selection and brand template list
  useEffect(() => {
    const init = async () => {
      try {
        // Load saved brand selection
        const store = await loadStore('settings.json');
        const saved = await store.get<string>('selectedBrandId');
        if (saved) setSelectedBrandId(saved);
      } catch {
        // ignore — use default
      }
      try {
        const list = await invoke<BrandTemplateInfo[]>('api_list_brand_templates');
        setBrandTemplates(list);
      } catch (e) {
        console.error('Failed to load brand templates:', e);
      }
    };
    init();
  }, []);

  // Persist brand selection
  const handleSetBrandId = useCallback(async (id: string) => {
    setSelectedBrandId(id);
    try {
      const store = await loadStore('settings.json');
      await store.set('selectedBrandId', id);
      await store.save();
    } catch {
      // ignore
    }
  }, []);

  // Refresh brand template list (called after saves/deletes in settings)
  const refreshBrandTemplates = useCallback(async () => {
    try {
      const list = await invoke<BrandTemplateInfo[]>('api_list_brand_templates');
      setBrandTemplates(list);
    } catch (e) {
      console.error('Failed to refresh brand templates:', e);
    }
  }, []);

  const handleExportWord = useCallback(async () => {
    try {
      let summaryMarkdown = '';

      // Try to get markdown from BlockNote editor first (same pattern as useCopyOperations)
      if (blockNoteSummaryRef.current?.getMarkdown) {
        summaryMarkdown = await blockNoteSummaryRef.current.getMarkdown();
      }

      // Fallback: Check if aiSummary has markdown property
      if (!summaryMarkdown && aiSummary && 'markdown' in aiSummary) {
        summaryMarkdown = (aiSummary as any).markdown || '';
      }

      // Fallback: Convert legacy format
      if (!summaryMarkdown && aiSummary) {
        const sections = Object.entries(aiSummary)
          .filter(([key]) => key !== 'markdown' && key !== 'summary_json' && key !== '_section_order' && key !== 'MeetingName')
          .map(([, section]) => {
            if (section && typeof section === 'object' && 'title' in section && 'blocks' in section) {
              const sectionTitle = `## ${section.title}\n\n`;
              const sectionContent = section.blocks
                .map((block: any) => `- ${block.content}`)
                .join('\n');
              return sectionTitle + sectionContent;
            }
            return '';
          })
          .filter(s => s.trim())
          .join('\n\n');
        summaryMarkdown = sections;
      }

      if (!summaryMarkdown.trim()) {
        toast.error('No summary content available to export');
        return;
      }

      // Load brand template and logo
      let brand: BrandTemplate | undefined;
      let logoBytes: Uint8Array | undefined;

      try {
        brand = await invoke<BrandTemplate>('api_get_brand_template', { id: selectedBrandId });
        const logoData = await invoke<number[] | null>('api_get_brand_template_logo', { id: selectedBrandId });
        if (logoData) {
          logoBytes = new Uint8Array(logoData);
        }
      } catch (e) {
        console.warn('Failed to load brand template, exporting without branding:', e);
      }

      // Generate the docx bytes
      const dateStr = new Date(meeting.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const bytes = await generateDocxFromMarkdown(summaryMarkdown, meetingTitle, dateStr, brand, logoBytes);

      // Sanitize the title for use as a filename
      const safeTitle = meetingTitle.replace(/[<>:"/\\|?*]/g, '_').trim() || 'meeting-summary';

      // Open native save dialog
      const filePath = await save({
        defaultPath: `${safeTitle}.docx`,
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
      });

      if (!filePath) {
        // User cancelled the dialog
        return;
      }

      // Write the file via Rust command (bypasses fs plugin scope restrictions)
      await invoke('write_bytes_to_file', { path: filePath, data: Array.from(bytes) });
      toast.success('Word document exported successfully');
    } catch (error) {
      console.error('Failed to export Word document:', error);
      toast.error('Failed to export Word document');
    }
  }, [meeting, meetingTitle, aiSummary, blockNoteSummaryRef, selectedBrandId]);

  return {
    handleExportWord,
    selectedBrandId,
    setSelectedBrandId: handleSetBrandId,
    brandTemplates,
    refreshBrandTemplates,
  };
}
