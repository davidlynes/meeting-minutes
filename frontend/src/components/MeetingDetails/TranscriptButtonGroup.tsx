"use client";

import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Copy, FolderOpen, FileUp, Loader2 } from 'lucide-react';
import { useImportAudio } from '@/hooks/useImportAudio';
import Analytics from '@/lib/analytics';


interface TranscriptButtonGroupProps {
  transcriptCount: number;
  onCopyTranscript: () => void;
  onOpenMeetingFolder: () => Promise<void>;
}


export function TranscriptButtonGroup({
  transcriptCount,
  onCopyTranscript,
  onOpenMeetingFolder
}: TranscriptButtonGroupProps) {
  const { importAudio, isImporting, progress } = useImportAudio();

  return (
    <div className="flex items-center justify-center w-full gap-2">
      <ButtonGroup>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            Analytics.trackButtonClick('copy_transcript', 'meeting_details');
            onCopyTranscript();
          }}
          disabled={transcriptCount === 0}
          title={transcriptCount === 0 ? 'No transcript available' : 'Copy Transcript'}
        >
          <Copy />
          <span className="hidden lg:inline">Copy</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="xl:px-4"
          onClick={() => {
            Analytics.trackButtonClick('open_recording_folder', 'meeting_details');
            onOpenMeetingFolder();
          }}
          title="Open Recording Folder"
        >
          <FolderOpen className="xl:mr-2" size={18} />
          <span className="hidden lg:inline">Recording</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            Analytics.trackButtonClick('import_audio', 'meeting_details');
            importAudio();
          }}
          disabled={isImporting}
          title="Import Audio File"
        >
          {isImporting ? <Loader2 className="animate-spin" /> : <FileUp />}
          <span className="hidden lg:inline">
            {isImporting ? `${progress.percent}%` : 'Import'}
          </span>
        </Button>
      </ButtonGroup>
    </div>
  );
}
