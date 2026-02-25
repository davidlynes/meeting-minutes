"use client";

import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Copy, Save, Loader2, FileDown, FileText, ChevronDown, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import Analytics from '@/lib/analytics';

interface BrandTemplateInfo {
  id: string;
  name: string;
  is_bundled: boolean;
}

interface SummaryUpdaterButtonGroupProps {
  isSaving: boolean;
  isDirty: boolean;
  onSave: () => Promise<void>;
  onCopy: () => Promise<void>;
  onExportWord: () => Promise<void>;
  onExportPdf: () => Promise<void>;
  onFind?: () => void;
  onOpenFolder: () => Promise<void>;
  hasSummary: boolean;
  brandTemplates?: BrandTemplateInfo[];
  selectedBrandId?: string;
  onBrandChange?: (id: string) => void;
}

export function SummaryUpdaterButtonGroup({
  isSaving,
  isDirty,
  onSave,
  onCopy,
  onExportWord,
  onExportPdf,
  onFind,
  onOpenFolder,
  hasSummary,
  brandTemplates = [],
  selectedBrandId = 'iq-standard',
  onBrandChange,
}: SummaryUpdaterButtonGroupProps) {
  const selectedBrandName = brandTemplates.find(b => b.id === selectedBrandId)?.name || 'Default';

  return (
    <div className="flex items-center gap-2">
      {/* Save & Copy group */}
      <ButtonGroup>
        <Button
          variant="outline"
          size="sm"
          className={`${isDirty ? 'bg-green-200' : ""}`}
          title={isSaving ? "Saving" : "Save Changes"}
          onClick={() => {
            Analytics.trackButtonClick('save_changes', 'meeting_details');
            onSave();
          }}
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <Loader2 className="animate-spin" />
              <span className="hidden lg:inline">Saving...</span>
            </>
          ) : (
            <>
              <Save />
              <span className="hidden lg:inline">Save</span>
            </>
          )}
        </Button>

        <Button
          variant="outline"
          size="sm"
          title="Copy Summary"
          onClick={() => {
            Analytics.trackButtonClick('copy_summary', 'meeting_details');
            onCopy();
          }}
          disabled={!hasSummary}
          className="cursor-pointer"
        >
          <Copy />
          <span className="hidden lg:inline">Copy</span>
        </Button>
      </ButtonGroup>

      {/* Export group: Word, PDF, and shared brand template selector */}
      <ButtonGroup>
        <Button
          variant="outline"
          size="sm"
          title={`Export as Word Document (${selectedBrandName})`}
          onClick={() => {
            Analytics.trackButtonClick('export_word', 'meeting_details');
            onExportWord();
          }}
          disabled={!hasSummary}
          className="cursor-pointer"
        >
          <FileDown />
          <span className="hidden lg:inline">Word</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          title={`Export as PDF Document (${selectedBrandName})`}
          onClick={() => {
            Analytics.trackButtonClick('export_pdf', 'meeting_details');
            onExportPdf();
          }}
          disabled={!hasSummary}
          className="cursor-pointer"
        >
          <FileText />
          <span className="hidden lg:inline">PDF</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasSummary}
              className="cursor-pointer px-1.5"
              title={`Brand template: ${selectedBrandName}`}
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            <DropdownMenuLabel>Brand Template</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {brandTemplates.map((brand) => (
              <DropdownMenuItem
                key={brand.id}
                onClick={() => onBrandChange?.(brand.id)}
                className="cursor-pointer"
              >
                <span className="flex items-center gap-2 w-full">
                  {brand.id === selectedBrandId && <Check className="h-3 w-3" />}
                  {brand.id !== selectedBrandId && <span className="w-3" />}
                  {brand.name}
                </span>
              </DropdownMenuItem>
            ))}
            {brandTemplates.length === 0 && (
              <DropdownMenuItem disabled>No templates available</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
    </div>
  );
}
