import * as vscode from 'vscode';

export const XML_SCHEME = 'facturx-xml';

interface XmlEntry {
  pdfUri: vscode.Uri;
  attachmentName: string;
  content: Uint8Array;
  mtime: number;
}

/**
 * Backs the XML pane with an in-memory, saveable virtual file so VS Code treats it
 * as a normal editable text document (dirty tracking, Ctrl+S, diagnostics) without
 * writing a temp file to disk. Saving re-injects the bytes into the source PDF via
 * onDidSaveXml.
 */
export class FacturXXmlFileSystemProvider implements vscode.FileSystemProvider {
  private readonly entries = new Map<string, XmlEntry>();

  private readonly didChangeFileEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.didChangeFileEmitter.event;

  private readonly didSaveXmlEmitter = new vscode.EventEmitter<{
    xmlUri: vscode.Uri;
    pdfUri: vscode.Uri;
    attachmentName: string;
    content: Uint8Array;
  }>();
  /** Fires after a virtual XML document is written, so the PDF attachment can be updated. */
  readonly onDidSaveXml = this.didSaveXmlEmitter.event;

  /** Registers (or replaces) the virtual XML document for a given PDF, returning its URI. */
  register(pdfUri: vscode.Uri, attachmentName: string, content: Uint8Array): vscode.Uri {
    const xmlUri = vscode.Uri.from({
      scheme: XML_SCHEME,
      path: `/${encodeURIComponent(pdfUri.toString())}/${encodeURIComponent(attachmentName)}`,
    });
    const existing = this.entries.get(xmlUri.toString());
    this.entries.set(xmlUri.toString(), {
      pdfUri,
      attachmentName,
      content,
      mtime: Date.now(),
    });
    if (existing) {
      this.didChangeFileEmitter.fire([{ type: vscode.FileChangeType.Changed, uri: xmlUri }]);
    }
    return xmlUri;
  }

  /** Looks up which PDF a virtual XML document belongs to, if it's currently registered. */
  pdfUriFor(xmlUri: vscode.Uri): vscode.Uri | undefined {
    return this.entries.get(xmlUri.toString())?.pdfUri;
  }

  /** Finds the virtual XML document currently registered for a given PDF, if any. */
  xmlUriFor(pdfUri: vscode.Uri): vscode.Uri | undefined {
    for (const [key, entry] of this.entries) {
      if (entry.pdfUri.toString() === pdfUri.toString()) {
        return vscode.Uri.parse(key);
      }
    }
    return undefined;
  }

  private entry(uri: vscode.Uri): XmlEntry {
    const entry = this.entries.get(uri.toString());
    if (!entry) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return entry;
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const entry = this.entry(uri);
    return {
      type: vscode.FileType.File,
      ctime: entry.mtime,
      mtime: entry.mtime,
      size: entry.content.byteLength,
    };
  }

  readFile(uri: vscode.Uri): Uint8Array {
    return this.entry(uri).content;
  }

  writeFile(uri: vscode.Uri, content: Uint8Array): void {
    const entry = this.entry(uri);
    entry.content = content;
    entry.mtime = Date.now();
    this.didChangeFileEmitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    this.didSaveXmlEmitter.fire({
      xmlUri: uri,
      pdfUri: entry.pdfUri,
      attachmentName: entry.attachmentName,
      content,
    });
  }

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => undefined);
  }

  readDirectory(): [string, vscode.FileType][] {
    return [];
  }

  createDirectory(): void {
    throw vscode.FileSystemError.NoPermissions('Directories are not supported');
  }

  delete(uri: vscode.Uri): void {
    this.entries.delete(uri.toString());
  }

  rename(): void {
    throw vscode.FileSystemError.NoPermissions('Renaming is not supported');
  }
}
