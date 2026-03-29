import { describe, it, expect } from 'vitest';
import { generatePdfFromMarkdown } from './pdfExport';
import { BrandTemplate } from './docxExport';

describe('generatePdfFromMarkdown', () => {
  it('generates a Uint8Array from simple markdown', async () => {
    const result = await generatePdfFromMarkdown(
      '# Hello\n\nSome text.',
      'Test Meeting',
      'January 1, 2025'
    );

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it('generates valid PDF bytes (PDF signature)', async () => {
    const result = await generatePdfFromMarkdown(
      'Simple text',
      'Title',
      'Jan 1'
    );

    // PDF files start with %PDF
    const header = String.fromCharCode(result[0], result[1], result[2], result[3], result[4]);
    expect(header).toBe('%PDF-');
  });

  it('handles headings of all levels', async () => {
    const md = '# H1\n## H2\n### H3\nBody text';
    const result = await generatePdfFromMarkdown(md, 'Heading Test', 'Jan 1');
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('handles unordered list items', async () => {
    const md = '- Item 1\n- Item 2\n* Item 3';
    const result = await generatePdfFromMarkdown(md, 'List Test', 'Jan 1');
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('handles ordered list items', async () => {
    const md = '1. First\n2. Second';
    const result = await generatePdfFromMarkdown(md, 'Ordered', 'Jan 1');
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('handles horizontal rules', async () => {
    const md = 'Above\n---\nBelow';
    const result = await generatePdfFromMarkdown(md, 'HR Test', 'Jan 1');
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('handles inline formatting: bold, italic, code', async () => {
    const md = '**bold** and *italic* and `code`';
    const result = await generatePdfFromMarkdown(md, 'Format', 'Jan 1');
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('handles empty markdown', async () => {
    const result = await generatePdfFromMarkdown('', 'Empty', 'Jan 1');
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('handles very long text (multi-page)', async () => {
    const longText = ('This is a long paragraph. '.repeat(200) + '\n').repeat(10);
    const result = await generatePdfFromMarkdown(longText, 'Long', 'Jan 1');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(1000);
  });

  it('accepts brand template for styled output', async () => {
    const brand: BrandTemplate = {
      id: 'test',
      name: 'Test',
      fonts: { heading: 'Calibri', body: 'Calibri' },
      colors: { primary: '7A00DF', secondary: '333333', heading: '111111', body: '444444' },
      headingSizes: { h1: 40, h2: 32, h3: 26 },
      header: '{title} - {date}',
      footer: 'Page footer {date}',
    };

    const result = await generatePdfFromMarkdown(
      '## Notes\n- Point one',
      'Branded',
      'March 1, 2025',
      brand
    );

    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('handles consecutive blank lines', async () => {
    const md = 'Line 1\n\n\n\nLine 2';
    const result = await generatePdfFromMarkdown(md, 'Blanks', 'Jan 1');
    expect(result).toBeInstanceOf(Uint8Array);
  });
});
