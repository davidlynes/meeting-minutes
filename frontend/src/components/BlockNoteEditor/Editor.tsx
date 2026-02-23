"use client";

import React, { useEffect } from "react";
import { PartialBlock, Block } from "@blocknote/core";
import "@blocknote/shadcn/style.css";
import "@blocknote/core/fonts/inter.css";

interface EditorProps {
  initialContent?: Block[];
  onChange?: (blocks: Block[]) => void;
  editable?: boolean;
}

// Error boundary to suppress non-fatal ProseMirror decoration errors (localsInner)
class EditorErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    // Don't switch to error state — the editor still works
    return { hasError: false };
  }

  componentDidCatch(error: Error) {
    // Suppress known ProseMirror decoration bug
    if (error.message?.includes('localsInner')) {
      return;
    }
    console.error('BlockNote editor error:', error);
  }

  render() {
    return this.props.children;
  }
}

// Suppress non-fatal ProseMirror localsInner errors from Next.js dev overlay.
// Next.js registers its own window.addEventListener("error") handler at module load
// time, so we must use a capturing listener + stopImmediatePropagation to prevent
// the error from reaching the dev overlay.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    if (e.error?.message?.includes('localsInner')) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true); // capture phase — runs before Next.js bubble-phase listener
}

export default function Editor({ initialContent, onChange, editable = true }: EditorProps) {
  // Lazy import to avoid SSR issues
  const { useCreateBlockNote } = require("@blocknote/react");
  const { BlockNoteView } = require("@blocknote/shadcn");

  const editor = useCreateBlockNote({
    initialContent: initialContent as PartialBlock[] | undefined,
  });

  // Expose blocksToMarkdown method
  (editor as any).blocksToMarkdownLossy = async (blocks: Block[]) => {
    try {
      return await editor.blocksToMarkdownLossy(blocks);
    } catch (error) {
      console.error('❌ EDITOR: Failed to convert blocks to markdown:', error);
      return '';
    }
  };

  // Handle content changes
  useEffect(() => {
    if (!onChange) return;

    const handleChange = () => {
      onChange(editor.document);
    };

    const unsubscribe = editor.onChange(handleChange);

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [editor, onChange]);

  return (
    <EditorErrorBoundary>
      <BlockNoteView editor={editor} editable={editable} theme="light" />
    </EditorErrorBoundary>
  );
}
