import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFHexString, PDFArray } from 'pdf-lib';
import {
  extractEmbeddedXml,
  replaceEmbeddedXml,
  upsertEmbeddedXml,
  DEFAULT_XML_ATTACHMENT_NAME,
} from '../src/pdfAttachment';

async function blankPdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  return doc.save();
}

describe('extractEmbeddedXml', () => {
  it('returns undefined for a PDF with no /Names dict at all', async () => {
    const doc = await PDFDocument.load(await blankPdfBytes());
    expect(extractEmbeddedXml(doc)).toBeUndefined();
  });

  it('returns undefined for a PDF whose /Names dict has no /EmbeddedFiles entry', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.catalog.set(PDFName.of('Names'), doc.context.obj({}));
    expect(extractEmbeddedXml(doc)).toBeUndefined();
  });

  it('extracts a PDF/A-3 attachment created via the high-level attach() API', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const xml = '<invoice>hello</invoice>';
    await doc.attach(new TextEncoder().encode(xml), 'factur-x.xml', { mimeType: 'text/xml' });
    const saved = await doc.save();

    const reloaded = await PDFDocument.load(saved);
    const embedded = extractEmbeddedXml(reloaded);
    expect(embedded).toBeDefined();
    expect(embedded!.name).toBe('factur-x.xml');
    expect(new TextDecoder().decode(embedded!.bytes)).toBe(xml);
  });

  it('prefers factur-x.xml over an unrelated attachment when multiple files are embedded', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    await doc.attach(new TextEncoder().encode('not the invoice'), 'readme.txt', {
      mimeType: 'text/plain',
    });
    await doc.attach(new TextEncoder().encode('<invoice/>'), 'factur-x.xml', {
      mimeType: 'text/xml',
    });
    const saved = await doc.save();

    const reloaded = await PDFDocument.load(saved);
    const embedded = extractEmbeddedXml(reloaded);
    expect(embedded?.name).toBe('factur-x.xml');
  });

  it('falls back to any .xml attachment when no known Factur-X name matches', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    await doc.attach(new TextEncoder().encode('<invoice/>'), 'unusual-name.xml', {
      mimeType: 'text/xml',
    });
    const saved = await doc.save();

    const reloaded = await PDFDocument.load(saved);
    const embedded = extractEmbeddedXml(reloaded);
    expect(embedded?.name).toBe('unusual-name.xml');
  });

  it('returns undefined when only non-XML attachments are present', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    await doc.attach(new TextEncoder().encode('hello'), 'notes.txt', { mimeType: 'text/plain' });
    const saved = await doc.save();

    const reloaded = await PDFDocument.load(saved);
    expect(extractEmbeddedXml(reloaded)).toBeUndefined();
  });

  it('does not throw and returns undefined when a name-tree entry has a name but a malformed/missing file spec', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const namesArray = doc.context.obj([PDFHexString.fromText('broken.xml'), doc.context.obj({})]);
    const efDict = doc.context.obj({ EmbeddedFiles: doc.context.obj({ Names: namesArray }) });
    doc.catalog.set(PDFName.of('Names'), efDict);

    expect(() => extractEmbeddedXml(doc)).not.toThrow();
    expect(extractEmbeddedXml(doc)).toBeUndefined();
  });
});

describe('replaceEmbeddedXml', () => {
  it('throws a descriptive error when the named attachment does not exist', async () => {
    const bytes = await blankPdfBytes();
    await expect(replaceEmbeddedXml(bytes, 'does-not-exist.xml', new Uint8Array())).rejects.toThrow(
      /not found/,
    );
  });

  it('replaces the stream content while preserving the attachment name', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    await doc.attach(new TextEncoder().encode('<invoice>v1</invoice>'), 'factur-x.xml', {
      mimeType: 'text/xml',
    });
    const original = await doc.save();

    const updated = await replaceEmbeddedXml(
      original,
      'factur-x.xml',
      new TextEncoder().encode('<invoice>v2</invoice>'),
    );

    const reloaded = await PDFDocument.load(updated);
    const embedded = extractEmbeddedXml(reloaded);
    expect(embedded?.name).toBe('factur-x.xml');
    expect(new TextDecoder().decode(embedded!.bytes)).toBe('<invoice>v2</invoice>');
  });

  it('handles a zero-byte replacement without corrupting the PDF', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    await doc.attach(new TextEncoder().encode('<invoice>v1</invoice>'), 'factur-x.xml', {
      mimeType: 'text/xml',
    });
    const original = await doc.save();

    const updated = await replaceEmbeddedXml(original, 'factur-x.xml', new Uint8Array());
    const reloaded = await PDFDocument.load(updated);
    const embedded = extractEmbeddedXml(reloaded);
    expect(embedded?.bytes.length).toBe(0);
  });
});

describe('upsertEmbeddedXml', () => {
  it('creates a new attachment (with /AF entry) on a PDF that has none yet', async () => {
    const bytes = await blankPdfBytes();
    const updated = await upsertEmbeddedXml(
      bytes,
      DEFAULT_XML_ATTACHMENT_NAME,
      new TextEncoder().encode('<invoice>new</invoice>'),
    );

    const reloaded = await PDFDocument.load(updated);
    const embedded = extractEmbeddedXml(reloaded);
    expect(embedded?.name).toBe(DEFAULT_XML_ATTACHMENT_NAME);

    const af = reloaded.catalog.lookupMaybe(PDFName.of('AF'), PDFArray);
    expect(af).toBeDefined();
  });

  it('replaces an existing attachment instead of duplicating it', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    await doc.attach(new TextEncoder().encode('<invoice>v1</invoice>'), DEFAULT_XML_ATTACHMENT_NAME, {
      mimeType: 'text/xml',
    });
    const original = await doc.save();

    const updated = await upsertEmbeddedXml(
      original,
      DEFAULT_XML_ATTACHMENT_NAME,
      new TextEncoder().encode('<invoice>v2</invoice>'),
    );

    const reloaded = await PDFDocument.load(updated);
    const embedded = extractEmbeddedXml(reloaded);
    expect(new TextDecoder().decode(embedded!.bytes)).toBe('<invoice>v2</invoice>');
  });

  it('is idempotent: calling it twice with the same content yields a readable, consistent PDF', async () => {
    const bytes = await blankPdfBytes();
    const once = await upsertEmbeddedXml(
      bytes,
      DEFAULT_XML_ATTACHMENT_NAME,
      new TextEncoder().encode('<invoice>same</invoice>'),
    );
    const twice = await upsertEmbeddedXml(
      once,
      DEFAULT_XML_ATTACHMENT_NAME,
      new TextEncoder().encode('<invoice>same</invoice>'),
    );

    const reloaded = await PDFDocument.load(twice);
    const embedded = extractEmbeddedXml(reloaded);
    expect(new TextDecoder().decode(embedded!.bytes)).toBe('<invoice>same</invoice>');
  });

  it('rejects when given bytes that are not a valid PDF at all', async () => {
    const garbage = new TextEncoder().encode('this is not a pdf');
    await expect(
      upsertEmbeddedXml(garbage, DEFAULT_XML_ATTACHMENT_NAME, new Uint8Array()),
    ).rejects.toThrow();
  });
});
