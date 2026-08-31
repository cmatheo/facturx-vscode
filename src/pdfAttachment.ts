import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFStream,
  PDFString,
  decodePDFRawStream,
} from 'pdf-lib';

export interface EmbeddedXmlFile {
  name: string;
  bytes: Uint8Array;
}

/** Names, in preference order, that Factur-X/ZUGFeRD profiles use for the embedded CII XML. */
const KNOWN_XML_NAMES = ['factur-x.xml', 'zugferd-invoice.xml', 'xrechnung.xml'];

function nameTreeEntries(namesArray: PDFArray): Array<{ name: string; fileSpec: PDFDict }> {
  const entries: Array<{ name: string; fileSpec: PDFDict }> = [];
  for (let i = 0; i + 1 < namesArray.size(); i += 2) {
    const nameObj = namesArray.lookup(i);
    const fileSpec = namesArray.lookup(i + 1, PDFDict);
    const name = nameObj instanceof PDFHexString || nameObj instanceof PDFString
      ? nameObj.decodeText()
      : undefined;
    if (name && fileSpec) {
      entries.push({ name, fileSpec });
    }
  }
  return entries;
}

function findEmbeddedFileNames(pdfDoc: PDFDocument): Array<{ name: string; fileSpec: PDFDict }> {
  const namesDict = pdfDoc.catalog.lookup(PDFName.of('Names'), PDFDict);
  if (!namesDict) {
    return [];
  }
  const embeddedFilesDict = namesDict.lookup(PDFName.of('EmbeddedFiles'), PDFDict);
  if (!embeddedFilesDict) {
    return [];
  }
  const namesArray = embeddedFilesDict.lookup(PDFName.of('Names'), PDFArray);
  if (!namesArray) {
    // A /Kids tree is possible for large attachment sets; Factur-X invoices carry
    // only a handful of attachments so a flat /Names array is the only case we support.
    return [];
  }
  return nameTreeEntries(namesArray);
}

function readEmbeddedFileStream(fileSpec: PDFDict): PDFRawStream | undefined {
  const efDict = fileSpec.lookup(PDFName.of('EF'), PDFDict);
  const stream = efDict?.lookup(PDFName.of('F'), PDFStream);
  return stream instanceof PDFRawStream ? stream : undefined;
}

/**
 * Extracts the embedded Factur-X/CII XML from a PDF/A-3 attachment.
 * Returns undefined if the PDF carries no recognizable embedded XML.
 */
export function extractEmbeddedXml(pdfDoc: PDFDocument): EmbeddedXmlFile | undefined {
  const entries = findEmbeddedFileNames(pdfDoc);
  if (entries.length === 0) {
    return undefined;
  }

  const preferred = KNOWN_XML_NAMES.map((known) =>
    entries.find((entry) => entry.name.toLowerCase() === known),
  ).find((entry) => entry !== undefined);
  const fallback = entries.find((entry) => entry.name.toLowerCase().endsWith('.xml'));
  const chosen = preferred ?? fallback;
  if (!chosen) {
    return undefined;
  }

  const stream = readEmbeddedFileStream(chosen.fileSpec);
  if (!stream) {
    return undefined;
  }

  return { name: chosen.name, bytes: decodePDFRawStream(stream).decode() };
}

/**
 * Replaces the bytes of the named embedded file attachment in place and returns the
 * re-serialized PDF. The attachment's name, description and other Filespec metadata
 * are preserved; only the stream content (and its /Params/Size) are updated.
 */
export async function replaceEmbeddedXml(
  pdfBytes: Uint8Array,
  attachmentName: string,
  newXmlBytes: Uint8Array,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const entries = findEmbeddedFileNames(pdfDoc);
  const entry = entries.find((candidate) => candidate.name === attachmentName);
  if (!entry) {
    throw new Error(`Embedded file "${attachmentName}" not found in PDF`);
  }

  const efDict = entry.fileSpec.lookup(PDFName.of('EF'), PDFDict);
  const oldStream = efDict?.lookup(PDFName.of('F'), PDFStream);
  if (!efDict || !(oldStream instanceof PDFRawStream)) {
    throw new Error(`Embedded file stream for "${attachmentName}" is malformed`);
  }

  const newStreamDict = pdfDoc.context.obj({
    Type: 'EmbeddedFile',
    Subtype: 'text/xml',
    Params: { Size: newXmlBytes.length },
  });
  const newStream = PDFRawStream.of(newStreamDict, newXmlBytes);
  const newStreamRef = pdfDoc.context.register(newStream);
  efDict.set(PDFName.of('F'), newStreamRef);

  return pdfDoc.save();
}
