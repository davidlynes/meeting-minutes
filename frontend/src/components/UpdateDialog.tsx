import React from 'react';
import { Download, X, AlertCircle, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { UpdateInfo } from '@/services/updateService';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updateInfo: UpdateInfo | null;
}

export function UpdateDialog({ open, onOpenChange, updateInfo }: UpdateDialogProps) {
  const handleDownload = async () => {
    if (!updateInfo?.downloadUrl) {
      toast.error('No download link available for this release');
      return;
    }

    try {
      await invoke('open_external_url', { url: updateInfo.downloadUrl });
      toast.success('Opening download page in your browser...');
      onOpenChange(false);
    } catch (err: any) {
      console.error('Failed to open download URL:', err);
      toast.error('Failed to open download link: ' + (err.message || 'Unknown error'));
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  if (!updateInfo?.available) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-blue-600" />
            Update Available
          </DialogTitle>
          <DialogDescription>
            A new version ({updateInfo.version}) is available
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Current Version:</span>
              <span className="font-medium">{updateInfo.currentVersion}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">New Version:</span>
              <span className="font-medium text-blue-600">{updateInfo.version}</span>
            </div>
            {updateInfo.date && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Release Date:</span>
                <span className="font-medium">{formatDate(updateInfo.date)}</span>
              </div>
            )}
          </div>

          {updateInfo.whatsNew && updateInfo.whatsNew.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
              <p className="text-sm font-medium text-gray-800 mb-2">What&apos;s New:</p>
              <ul className="text-sm text-gray-700 space-y-1">
                {updateInfo.whatsNew.map((item, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">&#8226;</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {updateInfo.body && !updateInfo.whatsNew?.length && (
            <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {updateInfo.body}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Later
          </Button>
          {updateInfo.downloadUrl && (
            <Button onClick={handleDownload} className="bg-blue-600 hover:bg-blue-700">
              <ExternalLink className="h-4 w-4 mr-2" />
              Download Update
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
