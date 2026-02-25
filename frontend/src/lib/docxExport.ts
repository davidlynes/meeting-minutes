import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  LevelFormat,
} from 'docx';

/** Parse inline formatting: **bold**, *italic*, `code` */
function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Match **bold**, *italic*, `code`, or plain text
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      // **bold**
      runs.push(new TextRun({ text: match[2], bold: true }));
    } else if (match[3]) {
      // *italic*
      runs.push(new TextRun({ text: match[3], italics: true }));
    } else if (match[4]) {
      // `code`
      runs.push(new TextRun({ text: match[4], font: 'Courier New', size: 20 }));
    } else if (match[5]) {
      // plain text
      runs.push(new TextRun({ text: match[5] }));
    }
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text }));
  }

  return runs;
}

/** Convert a markdown string into a .docx Uint8Array */
export async function generateDocxFromMarkdown(
  markdown: string,
  title: string,
  date: string,
): Promise<Uint8Array> {
  const paragraphs: Paragraph[] = [];

  // Title header
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 36 })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
  );

  // Date subtitle
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: date, color: '666666', size: 22 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }),
  );

  // Track bullet numbering for ordered lists
  let orderedListCounter = 0;

  const lines = markdown.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines (add spacing)
    if (!trimmed) {
      orderedListCounter = 0;
      paragraphs.push(new Paragraph({ spacing: { after: 100 } }));
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      orderedListCounter = 0;
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(trimmed.slice(4)),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        }),
      );
    } else if (trimmed.startsWith('## ')) {
      orderedListCounter = 0;
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(trimmed.slice(3)),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
        }),
      );
    } else if (trimmed.startsWith('# ')) {
      orderedListCounter = 0;
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(trimmed.slice(2)),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 280, after: 140 },
        }),
      );
    }
    // Horizontal rule
    else if (/^---+$/.test(trimmed)) {
      orderedListCounter = 0;
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: '' })],
          border: { bottom: { style: 'single' as any, size: 6, color: 'CCCCCC' } },
          spacing: { before: 100, after: 100 },
        }),
      );
    }
    // Unordered list items: - or *
    else if (/^[-*]\s+/.test(trimmed)) {
      orderedListCounter = 0;
      const content = trimmed.replace(/^[-*]\s+/, '');
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(content),
          bullet: { level: 0 },
          spacing: { after: 60 },
        }),
      );
    }
    // Ordered list items: 1. 2. etc.
    else if (/^\d+\.\s+/.test(trimmed)) {
      orderedListCounter++;
      const content = trimmed.replace(/^\d+\.\s+/, '');
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${orderedListCounter}. ` }),
            ...parseInlineFormatting(content),
          ],
          indent: { left: 720 },
          spacing: { after: 60 },
        }),
      );
    }
    // Regular paragraph
    else {
      orderedListCounter = 0;
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(trimmed),
          spacing: { after: 120 },
        }),
      );
    }
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'ordered-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [{ children: paragraphs }],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}
