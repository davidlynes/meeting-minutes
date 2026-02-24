"use client";

import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useRouter } from 'next/navigation';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { toast } from 'sonner';

interface ImportProgress {
  stage: string;
  percent: number;
  message: string;
}

interface ImportResult {
  status: string;
  meeting_id?: string;
  meeting_name?: string;
  segments_count?: number;
  duration_seconds?: number;
}

export function useImportAudio() {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>({ stage: '', percent: 0, message: '' });
  const router = useRouter();
  const { setCurrentMeeting, refetchMeetings } = useSidebar();

  // Listen for progress events
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const setup = async () => {
      unlisten = await listen<ImportProgress>('import-progress', (event) => {
        setProgress(event.payload);
      });
    };

    setup();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const importAudio = useCallback(async () => {
    if (isImporting) return;

    setIsImporting(true);
    setProgress({ stage: 'starting', percent: 0, message: 'Opening file picker...' });

    try {
      const result = await invoke<ImportResult>('import_audio_file', {});

      if (result.status === 'cancelled') {
        setIsImporting(false);
        setProgress({ stage: '', percent: 0, message: '' });
        return;
      }

      if (result.status === 'success' && result.meeting_id) {
        toast.success('Audio imported successfully', {
          description: `${result.segments_count} segments transcribed`,
        });

        // Refresh sidebar to show new meeting
        await refetchMeetings();

        // Navigate to the new meeting
        setCurrentMeeting({
          id: result.meeting_id,
          title: result.meeting_name || 'Imported Meeting',
        });
        router.push(`/meeting-details?id=${result.meeting_id}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error('Import failed', { description: errorMessage });
      setProgress({ stage: 'error', percent: 0, message: errorMessage });
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, router, setCurrentMeeting, refetchMeetings]);

  return { importAudio, isImporting, progress };
}
