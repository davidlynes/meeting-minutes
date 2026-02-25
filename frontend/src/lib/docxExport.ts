import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  LevelFormat,
  ImageRun,
  Header,
  Footer,
} from 'docx';

export interface BrandTemplate {
  id: string;
  name: string;
  logo?: string;
  fonts: {
    heading: string;
    body: string;
  };
  colors: {
    primary: string;
    secondary: string;
    heading: string;
    body: string;
  };
  headingSizes: {
    h1: number;
    h2: number;
    h3: number;
  };
  header?: string;
  footer?: string;
}

/** Parse inline formatting: **bold**, *italic*, `code` */
function parseInlineFormatting(
  text: string,
  opts?: { font?: string; color?: string; size?: number },
): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true, font: opts?.font, color: opts?.color, size: opts?.size }));
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], italics: true, font: opts?.font, color: opts?.color, size: opts?.size }));
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4], font: 'Courier New', size: opts?.size ?? 20, color: opts?.color }));
    } else if (match[5]) {
      runs.push(new TextRun({ text: match[5], font: opts?.font, color: opts?.color, size: opts?.size }));
    }
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text, font: opts?.font, color: opts?.color, size: opts?.size }));
  }

  return runs;
}

/** Read PNG dimensions from header bytes */
function getPngDimensions(data: Uint8Array): { width: number; height: number } | null {
  // PNG signature check (first 8 bytes)
  if (data.length < 24) return null;
  if (data[0] !== 0x89 || data[1] !== 0x50) return null;
  // IHDR chunk: width at byte 16, height at byte 20 (big-endian uint32)
  const width = (data[16] << 24 | data[17] << 16 | data[18] << 8 | data[19]) >>> 0;
  const height = (data[20] << 24 | data[21] << 16 | data[22] << 8 | data[23]) >>> 0;
  if (width > 0 && height > 0) return { width, height };
  return null;
}

/** Check if a trimmed line is a list item (bullet or ordered) */
function isListItem(line: string): boolean {
  return /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line);
}

/** Convert a markdown string into a .docx Uint8Array */
export async function generateDocxFromMarkdown(
  markdown: string,
  title: string,
  date: string,
  brand?: BrandTemplate,
  logoBytes?: Uint8Array,
): Promise<Uint8Array> {
  const paragraphs: Paragraph[] = [];

  // Brand-aware defaults
  const headingFont = brand?.fonts.heading;
  const bodyFont = brand?.fonts.body;
  const headingColor = brand?.colors.heading;
  const bodyColor = brand?.colors.body;
  const primaryColor = brand?.colors.primary;
  const h1Size = brand?.headingSizes.h1;
  const h2Size = brand?.headingSizes.h2;
  const h3Size = brand?.headingSizes.h3;

  // Logo at top of document — preserve aspect ratio, fit within max bounds
  if (logoBytes && logoBytes.length > 0) {
    const maxWidth = 120;
    const maxHeight = 120;
    let imgWidth = maxWidth;
    let imgHeight = maxHeight;

    const dims = getPngDimensions(logoBytes);
    if (dims) {
      const aspect = dims.width / dims.height;
      if (aspect >= 1) {
        // Landscape or square
        imgWidth = maxWidth;
        imgHeight = Math.round(maxWidth / aspect);
      } else {
        // Portrait
        imgHeight = maxHeight;
        imgWidth = Math.round(maxHeight * aspect);
      }
    }

    paragraphs.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: logoBytes,
            transformation: { width: imgWidth, height: imgHeight },
            type: 'png',
          }),
        ],
        spacing: { after: 200 },
      }),
    );
  }

  // Title header
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: h1Size ?? 36,
          font: headingFont,
          color: primaryColor,
        }),
      ],
      heading: HeadingLevel.TITLE,
      spacing: { after: 80 },
    }),
  );

  // Date subtitle
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: date,
          color: bodyColor ?? '666666',
          size: 20,
          font: bodyFont,
        }),
      ],
      spacing: { after: 200 },
    }),
  );

  // Horizontal rule separator after date
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: '' })],
      border: { bottom: { style: 'single' as any, size: 4, color: primaryColor ?? 'CCCCCC' } },
      spacing: { after: 200 },
    }),
  );

  // Track bullet numbering for ordered lists
  let orderedListCounter = 0;

  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Handle empty lines — collapse consecutive empties and skip spacers
    // between list items to avoid double-spacing bullets
    if (!trimmed) {
      orderedListCounter = 0;

      // Look at what's before and after this blank line
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';

      // Skip blank lines between consecutive list items
      if (isListItem(prevLine) && isListItem(nextLine)) {
        continue;
      }

      // Skip consecutive blank lines (only emit one spacer)
      if (i > 0 && lines[i - 1].trim() === '') {
        continue;
      }

      // Add a modest spacer for section breaks
      paragraphs.push(new Paragraph({ spacing: { after: 80 } }));
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      orderedListCounter = 0;
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(trimmed.slice(4), {
            font: headingFont,
            color: headingColor,
            size: h3Size,
          }),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 160, after: 80 },
        }),
      );
    } else if (trimmed.startsWith('## ')) {
      orderedListCounter = 0;
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(trimmed.slice(3), {
            font: headingFont,
            color: headingColor,
            size: h2Size,
          }),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
        }),
      );
    } else if (trimmed.startsWith('# ')) {
      orderedListCounter = 0;
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(trimmed.slice(2), {
            font: headingFont,
            color: headingColor,
            size: h1Size,
          }),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 100 },
        }),
      );
    }
    // Horizontal rule
    else if (/^---+$/.test(trimmed)) {
      orderedListCounter = 0;
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: '' })],
          border: { bottom: { style: 'single' as any, size: 4, color: 'CCCCCC' } },
          spacing: { before: 80, after: 80 },
        }),
      );
    }
    // Unordered list items: - or *
    else if (/^[-*]\s+/.test(trimmed)) {
      orderedListCounter = 0;
      const content = trimmed.replace(/^[-*]\s+/, '');
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(content, { font: bodyFont, color: bodyColor }),
          bullet: { level: 0 },
          spacing: { after: 40 },
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
            new TextRun({ text: `${orderedListCounter}. `, font: bodyFont, color: bodyColor }),
            ...parseInlineFormatting(content, { font: bodyFont, color: bodyColor }),
          ],
          indent: { left: 720 },
          spacing: { after: 40 },
        }),
      );
    }
    // Regular paragraph
    else {
      orderedListCounter = 0;
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(trimmed, { font: bodyFont, color: bodyColor }),
          spacing: { after: 100 },
        }),
      );
    }
  }

  // Build header/footer for the section if brand specifies them
  const sectionHeaders = brand?.header
    ? {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: brand.header
                    .replace('{title}', title)
                    .replace('{date}', date),
                  font: headingFont,
                  color: primaryColor ?? '999999',
                  size: 16,
                }),
              ],
              alignment: AlignmentType.RIGHT,
            }),
          ],
        }),
      }
    : undefined;

  const sectionFooters = brand?.footer
    ? {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: brand.footer.replace('{date}', date),
                  font: bodyFont,
                  color: '999999',
                  size: 16,
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
      }
    : undefined;

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
    sections: [
      {
        headers: sectionHeaders,
        footers: sectionFooters,
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
