import { jsPDF } from 'jspdf';
import { BrandTemplate } from './docxExport';

/** Convert hex color string (e.g. "7A00DF") to RGB tuple */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

/** Check if a trimmed line is a list item (bullet or ordered) */
function isListItem(line: string): boolean {
  return /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line);
}

/** Strip inline markdown formatting for plain text rendering */
function stripInlineFormatting(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1');
}

interface TextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

/** Parse inline markdown formatting into segments */
function parseInlineSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      segments.push({ text: match[2], bold: true });
    } else if (match[3]) {
      segments.push({ text: match[3], italic: true });
    } else if (match[4]) {
      segments.push({ text: match[4], code: true });
    } else if (match[5]) {
      segments.push({ text: match[5] });
    }
  }

  if (segments.length === 0) {
    segments.push({ text });
  }

  return segments;
}

/** Render inline-formatted text at a given position, returning the final Y position */
function renderInlineText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  opts: {
    fontSize: number;
    fontFamily: string;
    color: [number, number, number];
    lineHeight: number;
  },
): number {
  const segments = parseInlineSegments(text);

  // For simplicity, render as a single styled line with word wrapping
  // jsPDF doesn't support mixed inline styles in splitTextToSize, so we render
  // the full text with the base style and overlay bold/italic segments
  const plainText = stripInlineFormatting(text);

  doc.setFontSize(opts.fontSize);
  doc.setFont(opts.fontFamily, 'normal');
  doc.setTextColor(...opts.color);

  // Check if text has any formatting - if all plain, use simple rendering
  const hasFormatting = segments.some(s => s.bold || s.italic || s.code);

  if (!hasFormatting) {
    const lines = doc.splitTextToSize(plainText, maxWidth) as string[];
    doc.text(lines, x, y);
    return y + lines.length * opts.lineHeight;
  }

  // For formatted text, render segment by segment with word wrapping
  // First, calculate if we need wrapping by measuring total width
  let totalWidth = 0;
  for (const seg of segments) {
    const style = seg.bold ? 'bold' : seg.italic ? 'italic' : 'normal';
    const font = seg.code ? 'courier' : opts.fontFamily;
    doc.setFont(font, style);
    doc.setFontSize(seg.code ? opts.fontSize - 1 : opts.fontSize);
    totalWidth += doc.getTextWidth(seg.text);
  }

  if (totalWidth <= maxWidth) {
    // Single line - render each segment inline
    let cursorX = x;
    for (const seg of segments) {
      const style = seg.bold ? 'bold' : seg.italic ? 'italic' : 'normal';
      const font = seg.code ? 'courier' : opts.fontFamily;
      doc.setFont(font, style);
      doc.setFontSize(seg.code ? opts.fontSize - 1 : opts.fontSize);
      doc.setTextColor(...opts.color);
      doc.text(seg.text, cursorX, y);
      cursorX += doc.getTextWidth(seg.text);
    }
    return y + opts.lineHeight;
  }

  // Multi-line: fall back to plain text wrapping with base style
  doc.setFont(opts.fontFamily, 'normal');
  doc.setFontSize(opts.fontSize);
  doc.setTextColor(...opts.color);
  const lines = doc.splitTextToSize(plainText, maxWidth) as string[];
  doc.text(lines, x, y);
  return y + lines.length * opts.lineHeight;
}

/** Convert a markdown string into a PDF Uint8Array */
export async function generatePdfFromMarkdown(
  markdown: string,
  title: string,
  date: string,
  brand?: BrandTemplate,
  logoBytes?: Uint8Array,
): Promise<Uint8Array> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Page dimensions
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 20;
  const marginRight = 20;
  const marginTop = 20;
  const marginBottom = 25;
  const contentWidth = pageWidth - marginLeft - marginRight;

  // Brand-aware styling
  const headingFont = brand?.fonts.heading === 'Calibri' ? 'helvetica' : 'helvetica';
  const bodyFont = brand?.fonts.body === 'Calibri' ? 'helvetica' : 'helvetica';
  const headingColor: [number, number, number] = brand?.colors.heading
    ? hexToRgb(brand.colors.heading)
    : [0, 0, 0];
  const bodyColor: [number, number, number] = brand?.colors.body
    ? hexToRgb(brand.colors.body)
    : [51, 51, 51];
  const primaryColor: [number, number, number] = brand?.colors.primary
    ? hexToRgb(brand.colors.primary)
    : [0, 0, 0];

  const h1Size = brand?.headingSizes.h1 ? brand.headingSizes.h1 * 0.55 : 20;
  const h2Size = brand?.headingSizes.h2 ? brand.headingSizes.h2 * 0.55 : 16;
  const h3Size = brand?.headingSizes.h3 ? brand.headingSizes.h3 * 0.55 : 13;
  const bodySize = 10;
  const bodyLineHeight = 5;

  let y = marginTop;

  /** Add header and footer to the current page */
  const addHeaderFooter = (pageNum: number, totalPages?: number) => {
    // Header
    if (brand?.header) {
      const headerText = brand.header
        .replace('{title}', title)
        .replace('{date}', date);
      doc.setFontSize(8);
      doc.setFont(headingFont, 'normal');
      doc.setTextColor(...primaryColor);
      doc.text(headerText, pageWidth - marginRight, 12, { align: 'right' });
    }

    // Footer
    if (brand?.footer) {
      const footerText = brand.footer.replace('{date}', date);
      doc.setFontSize(8);
      doc.setFont(bodyFont, 'normal');
      doc.setTextColor(153, 153, 153);
      doc.text(footerText, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }
  };

  /** Check if we need a new page and add one if so */
  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - marginBottom) {
      addHeaderFooter(doc.getNumberOfPages());
      doc.addPage();
      y = marginTop;
    }
  };

  // Logo at top of document
  if (logoBytes && logoBytes.length > 0) {
    try {
      // Convert Uint8Array to base64
      let binary = '';
      for (let i = 0; i < logoBytes.length; i++) {
        binary += String.fromCharCode(logoBytes[i]);
      }
      const base64 = btoa(binary);

      // Detect image format
      const isPng = logoBytes[0] === 0x89 && logoBytes[1] === 0x50;
      const format = isPng ? 'PNG' : 'JPEG';

      // Calculate dimensions (max 30mm width, preserve aspect ratio)
      const maxLogoWidth = 30;
      const maxLogoHeight = 30;

      // Use a reasonable default aspect ratio, jsPDF handles sizing
      doc.addImage(
        `data:image/${format.toLowerCase()};base64,${base64}`,
        format,
        marginLeft,
        y,
        maxLogoWidth,
        maxLogoHeight,
        undefined,
        'FAST',
      );
      y += maxLogoHeight + 5;
    } catch (e) {
      console.warn('Failed to add logo to PDF:', e);
    }
  }

  // Title
  ensureSpace(15);
  doc.setFontSize(h1Size);
  doc.setFont(headingFont, 'bold');
  doc.setTextColor(...primaryColor);
  const titleLines = doc.splitTextToSize(title, contentWidth) as string[];
  doc.text(titleLines, marginLeft, y);
  y += titleLines.length * (h1Size * 0.5) + 3;

  // Date subtitle
  ensureSpace(8);
  doc.setFontSize(10);
  doc.setFont(bodyFont, 'normal');
  const dateColor: [number, number, number] = brand?.colors.body
    ? hexToRgb(brand.colors.body)
    : [102, 102, 102];
  doc.setTextColor(...dateColor);
  doc.text(date, marginLeft, y);
  y += 6;

  // Horizontal rule
  doc.setDrawColor(...primaryColor);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, pageWidth - marginRight, y);
  y += 6;

  // Track bullet numbering for ordered lists
  let orderedListCounter = 0;

  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Handle empty lines
    if (!trimmed) {
      orderedListCounter = 0;

      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';

      // Skip blank lines between consecutive list items
      if (isListItem(prevLine) && isListItem(nextLine)) {
        continue;
      }

      // Skip consecutive blank lines
      if (i > 0 && lines[i - 1].trim() === '') {
        continue;
      }

      y += 3;
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      orderedListCounter = 0;
      const text = trimmed.slice(4);
      ensureSpace(h3Size * 0.6 + 4);
      y += 4;
      y = renderInlineText(doc, text, marginLeft, y, contentWidth, {
        fontSize: h3Size,
        fontFamily: headingFont,
        color: headingColor,
        lineHeight: h3Size * 0.5,
      });
      y += 1;
    } else if (trimmed.startsWith('## ')) {
      orderedListCounter = 0;
      const text = trimmed.slice(3);
      ensureSpace(h2Size * 0.6 + 5);
      y += 5;
      y = renderInlineText(doc, text, marginLeft, y, contentWidth, {
        fontSize: h2Size,
        fontFamily: headingFont,
        color: headingColor,
        lineHeight: h2Size * 0.5,
      });
      y += 2;
    } else if (trimmed.startsWith('# ')) {
      orderedListCounter = 0;
      const text = trimmed.slice(2);
      ensureSpace(h1Size * 0.6 + 6);
      y += 6;
      y = renderInlineText(doc, text, marginLeft, y, contentWidth, {
        fontSize: h1Size,
        fontFamily: headingFont,
        color: headingColor,
        lineHeight: h1Size * 0.5,
      });
      y += 3;
    }
    // Horizontal rule
    else if (/^---+$/.test(trimmed)) {
      orderedListCounter = 0;
      ensureSpace(6);
      y += 2;
      doc.setDrawColor(204, 204, 204);
      doc.setLineWidth(0.3);
      doc.line(marginLeft, y, pageWidth - marginRight, y);
      y += 4;
    }
    // Unordered list items
    else if (/^[-*]\s+/.test(trimmed)) {
      orderedListCounter = 0;
      const content = trimmed.replace(/^[-*]\s+/, '');
      const bulletIndent = 6;
      ensureSpace(bodyLineHeight + 1);

      // Draw bullet point
      doc.setFillColor(...bodyColor);
      doc.circle(marginLeft + 2, y - 1.2, 0.8, 'F');

      y = renderInlineText(doc, content, marginLeft + bulletIndent, y, contentWidth - bulletIndent, {
        fontSize: bodySize,
        fontFamily: bodyFont,
        color: bodyColor,
        lineHeight: bodyLineHeight,
      });
      y += 0.5;
    }
    // Ordered list items
    else if (/^\d+\.\s+/.test(trimmed)) {
      orderedListCounter++;
      const content = trimmed.replace(/^\d+\.\s+/, '');
      const numberIndent = 8;
      ensureSpace(bodyLineHeight + 1);

      // Draw number
      doc.setFontSize(bodySize);
      doc.setFont(bodyFont, 'normal');
      doc.setTextColor(...bodyColor);
      doc.text(`${orderedListCounter}.`, marginLeft + 1, y);

      y = renderInlineText(doc, content, marginLeft + numberIndent, y, contentWidth - numberIndent, {
        fontSize: bodySize,
        fontFamily: bodyFont,
        color: bodyColor,
        lineHeight: bodyLineHeight,
      });
      y += 0.5;
    }
    // Regular paragraph
    else {
      orderedListCounter = 0;
      ensureSpace(bodyLineHeight + 1);
      y = renderInlineText(doc, trimmed, marginLeft, y, contentWidth, {
        fontSize: bodySize,
        fontFamily: bodyFont,
        color: bodyColor,
        lineHeight: bodyLineHeight,
      });
      y += 2;
    }
  }

  // Add header/footer to all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    addHeaderFooter(p, totalPages);
  }

  // Return as Uint8Array
  const arrayBuffer = doc.output('arraybuffer');
  return new Uint8Array(arrayBuffer);
}
