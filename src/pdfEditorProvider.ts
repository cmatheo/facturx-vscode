import * as vscode from 'vscode';
import { PDFDocument } from 'pdf-lib';
import { DEFAULT_XML_ATTACHMENT_NAME, extractEmbeddedXml } from './pdfAttachment';
import { blankCiiInvoiceSkeleton } from './facturxProfile';
import { FacturXXmlFileSystemProvider } from './xmlFileSystemProvider';

class PdfDocument implements vscode.CustomDocument {
  constructor(readonly uri: vscode.Uri) {}
  dispose(): void {}
}

const PDFJS_BUILD_PATH = ['node_modules', 'pdfjs-dist', 'legacy', 'build'];

/**
 * Renders the PDF (left pane, via a bundled pdf.js instance drawing to a canvas —
 * VS Code webviews cannot rely on the browser's native PDF plugin) and, when a
 * Factur-X CII XML attachment is found, opens it as a real editable text document
 * beside it (right pane) backed by FacturXXmlFileSystemProvider.
 */
export class PdfXmlEditorProvider implements vscode.CustomReadonlyEditorProvider<PdfDocument> {
  static readonly viewType = 'facturx.pdfXmlEditor';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly xmlFs: FacturXXmlFileSystemProvider,
  ) {}

  openCustomDocument(uri: vscode.Uri): PdfDocument {
    return new PdfDocument(uri);
  }

  async resolveCustomEditor(
    document: PdfDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(document.uri, '..'),
        vscode.Uri.joinPath(this.extensionUri, ...PDFJS_BUILD_PATH),
      ],
    };
    webviewPanel.webview.html = this.renderPdfHtml(webviewPanel.webview);

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await vscode.workspace.fs.readFile(document.uri);
    } catch (error) {
      vscode.window.showErrorMessage(
        vscode.l10n.t('Failed to read {0}: {1}', document.uri.fsPath, String(error)),
      );
      return;
    }

    const readySubscription = webviewPanel.webview.onDidReceiveMessage((message) => {
      if (message?.type === 'ready') {
        void webviewPanel.webview.postMessage({
          type: 'load',
          base64: Buffer.from(pdfBytes).toString('base64'),
        });
      }
    });
    webviewPanel.onDidDispose(() => readySubscription.dispose());

    await this.openEmbeddedXml(document.uri, pdfBytes);
  }

  private async openEmbeddedXml(pdfUri: vscode.Uri, pdfBytes: Uint8Array): Promise<void> {
    let embedded;
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      embedded = extractEmbeddedXml(pdfDoc);
    } catch (error) {
      vscode.window.showErrorMessage(
        vscode.l10n.t('Failed to parse PDF {0}: {1}', pdfUri.fsPath, String(error)),
      );
      return;
    }

    if (!embedded) {
      vscode.window.showInformationMessage(
        vscode.l10n.t(
          'No embedded Factur-X XML found in {0}. A blank MINIMUM-profile invoice was opened; saving it will add it as a new attachment.',
          pdfUri.fsPath,
        ),
      );
      embedded = {
        name: DEFAULT_XML_ATTACHMENT_NAME,
        bytes: new TextEncoder().encode(blankCiiInvoiceSkeleton()),
      };
    }

    const xmlUri = this.xmlFs.register(pdfUri, embedded.name, embedded.bytes);
    const xmlDocument = await vscode.workspace.openTextDocument(xmlUri);
    await vscode.languages.setTextDocumentLanguage(xmlDocument, 'xml');
    await vscode.window.showTextDocument(xmlDocument, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: false,
      preserveFocus: true,
    });
  }

  private renderPdfHtml(webview: vscode.Webview): string {
    const pdfjsBuildUri = vscode.Uri.joinPath(this.extensionUri, ...PDFJS_BUILD_PATH);
    const pdfMainUri = webview.asWebviewUri(vscode.Uri.joinPath(pdfjsBuildUri, 'pdf.mjs'));
    const pdfWorkerUri = webview.asWebviewUri(vscode.Uri.joinPath(pdfjsBuildUri, 'pdf.worker.mjs'));
    const nonce = generateNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' ${webview.cspSource}; worker-src ${webview.cspSource}; style-src 'unsafe-inline'; canvas-src ${webview.cspSource};" />
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: var(--vscode-editor-background); }
    body { overflow-y: auto; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 8px; box-sizing: border-box; }
    #toolbar { position: sticky; top: 0; display: flex; gap: 4px; z-index: 1; }
    #toolbar button { cursor: pointer; }
    canvas { box-shadow: 0 0 4px var(--vscode-widget-shadow); }
    #status { color: var(--vscode-descriptionForeground); font-family: var(--vscode-font-family); }
  </style>
</head>
<body>
  <div id="toolbar">
    <button id="zoomOut">-</button>
    <span id="zoomLevel">100%</span>
    <button id="zoomIn">+</button>
  </div>
  <div id="status">Loading PDF…</div>
  <div id="pages"></div>
  <script type="module" nonce="${nonce}">
    import * as pdfjsLib from '${pdfMainUri}';
    pdfjsLib.GlobalWorkerOptions.workerSrc = '${pdfWorkerUri}';

    const pagesEl = document.getElementById('pages');
    const statusEl = document.getElementById('status');
    const zoomLevelEl = document.getElementById('zoomLevel');
    let pdfDocument;
    let scale = 1.0;

    function base64ToBytes(base64) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }

    async function renderAllPages() {
      pagesEl.innerHTML = '';
      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        pagesEl.appendChild(canvas);
        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport }).promise;
      }
    }

    document.getElementById('zoomIn').addEventListener('click', () => {
      scale = Math.min(scale + 0.25, 4);
      zoomLevelEl.textContent = Math.round(scale * 100) + '%';
      if (pdfDocument) { renderAllPages(); }
    });
    document.getElementById('zoomOut').addEventListener('click', () => {
      scale = Math.max(scale - 0.25, 0.25);
      zoomLevelEl.textContent = Math.round(scale * 100) + '%';
      if (pdfDocument) { renderAllPages(); }
    });

    window.addEventListener('message', async (event) => {
      const message = event.data;
      if (message.type !== 'load') {
        return;
      }
      try {
        const bytes = base64ToBytes(message.base64);
        pdfDocument = await pdfjsLib.getDocument({ data: bytes }).promise;
        statusEl.style.display = 'none';
        await renderAllPages();
      } catch (error) {
        statusEl.textContent = 'Failed to render PDF: ' + error;
      }
    });

    const vscodeApi = acquireVsCodeApi();
    vscodeApi.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

function generateNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
