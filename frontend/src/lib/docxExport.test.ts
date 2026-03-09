import { describe, it, expect } from 'vitest';
import { generateDocxFromMarkdown, BrandTemplate } from './docxExport';

describe('generateDocxFromMarkdown', () => {
  it('generates a Uint8Array from simple markdown', async () => {
    const result = await generateDocxFromMarkdown(
      '# Hello\n\nSome text.',
      'Test Meeting',
      'January 1, 2025'
    );

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it('generates valid docx bytes (ZIP signature)', async () => {
    const result = await generateDocxFromMarkdown(
      'Simple text',
      'Title',
      'Jan 1'
    );

    // DOCX files are ZIP archives; first two bytes are PK (0x50, 0x4B)
    expect(result[0]).toBe(0x50);
    expect(result[1]).toBe(0x4B);
  });

  it('handles headings of all levels', async () => {
    const md = '# H1\n## H2\n### H3\nRegular text';
    const result = await generateDocxFromMarkdown(md, 'Heading Test', 'Jan 1');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles unordered list items', async () => {
    const md = '- Item 1\n- Item 2\n* Item 3';
    const result = await generateDocxFromMarkdown(md, 'List Test', 'Jan 1');
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('handles ordered list items', async () => {
    const md = '1. First\n2. Second\n3. Third';
    const result = await generateDocxFromMarkdown(md, 'Ordered List', 'Jan 1');
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('handles horizontal rules', async () => {
    const md = 'Above\n---\nBelow';
    const result = await generateDocxFromMarkdown(md, 'HR Test', 'Jan 1');
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('handles inline formatting: bold, italic, code', async () => {
    const md = '**bold** text *italic* text `code` text';
    const result = await generateDocxFromMarkdown(md, 'Format Test', 'Jan 1');
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('handles empty markdown', async () => {
    const result = await generateDocxFromMarkdown('', 'Empty', 'Jan 1');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles consecutive blank lines', async () => {
    const md = 'Line 1\n\n\n\nLine 2';
    const result = await generateDocxFromMarkdown(md, 'Blank Lines', 'Jan 1');
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('accepts brand template for styled output', async () => {
    const brand: BrandTemplate = {
      id: 'test-brand',
      name: 'Test Brand',
      fonts: { heading: 'Arial', body: 'Calibri' },
      colors: { primary: '7A00DF', secondary: '333333', heading: '111111', body: '444444' },
      headingSizes: { h1: 40, h2: 32, h3: 26 },
      header: '{title} - {date}',
      footer: 'Generated on {date}',
    };

    const result = await generateDocxFromMarkdown(
      '## Meeting Notes\n- Important point',
      'Branded Meeting',
      'March 1, 2025',
      brand
    );

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles brand template without header/footer', async () => {
    const brand: BrandTemplate = {
      id: 'minimal',
      name: 'Minimal',
      fonts: { heading: 'Helvetica', body: 'Helvetica' },
      colors: { primary: '000000', secondary: '999999', heading: '000000', body: '333333' },
      headingSizes: { h1: 36, h2: 28, h3: 24 },
    };

    const result = await generateDocxFromMarkdown('Text', 'Title', 'Jan 1', brand);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('handles mixed list items between blank lines', async () => {
    const md = '- Item 1\n\n- Item 2\n\n1. Ordered 1\n\n2. Ordered 2';
    const result = await generateDocxFromMarkdown(md, 'Mixed Lists', 'Jan 1');
    expect(result).toBeInstanceOf(Uint8Array);
  });
});
