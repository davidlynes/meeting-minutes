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

  // Logo at top of document
  if (logoBytes && logoBytes.length > 0) {
    paragraphs.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: logoBytes,
            transformation: { width: 150, height: 50 },
            type: 'png',
          }),
        ],
        alignment: AlignmentType.CENTER,
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
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
  );

  // Date subtitle
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: date,
          color: bodyColor ?? '666666',
          size: 22,
          font: bodyFont,
        }),
      ],
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
          children: parseInlineFormatting(trimmed.slice(4), {
            font: headingFont,
            color: headingColor,
            size: h3Size,
          }),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
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
          spacing: { before: 240, after: 120 },
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
          children: parseInlineFormatting(content, { font: bodyFont, color: bodyColor }),
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
            new TextRun({ text: `${orderedListCounter}. `, font: bodyFont, color: bodyColor }),
            ...parseInlineFormatting(content, { font: bodyFont, color: bodyColor }),
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
          children: parseInlineFormatting(trimmed, { font: bodyFont, color: bodyColor }),
          spacing: { after: 120 },
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
                  size: 18,
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
