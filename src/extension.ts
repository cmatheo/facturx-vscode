import * as vscode from 'vscode';
import { PdfXmlEditorProvider } from './pdfEditorProvider';
import { replaceEmbeddedXml } from './pdfAttachment';
import { FacturXXmlFileSystemProvider, XML_SCHEME } from './xmlFileSystemProvider';
import { registerXmlValidation } from './xmlValidation';

export function activate(context: vscode.ExtensionContext): void {
  const xmlFs = new FacturXXmlFileSystemProvider();

  registerXmlValidation(context);

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(XML_SCHEME, xmlFs, {
      isCaseSensitive: true,
    }),
    vscode.window.registerCustomEditorProvider(
      PdfXmlEditorProvider.viewType,
      new PdfXmlEditorProvider(context.extensionUri, xmlFs),
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    xmlFs.onDidSaveXml(async ({ pdfUri, attachmentName, content }) => {
      try {
        const pdfBytes = await vscode.workspace.fs.readFile(pdfUri);
        const updatedPdf = await replaceEmbeddedXml(pdfBytes, attachmentName, content);
        await vscode.workspace.fs.writeFile(pdfUri, updatedPdf);
      } catch (error) {
        vscode.window.showErrorMessage(
          vscode.l10n.t('Failed to save XML back into {0}: {1}', pdfUri.fsPath, String(error)),
        );
      }
    }),
    vscode.commands.registerCommand('facturx.openSideBySide', async () => {
      const activeUri = vscode.window.activeTextEditor?.document.uri;
      const target = activeUri ?? vscode.window.tabGroups.activeTabGroup.activeTab?.input;
      const uri =
        target instanceof vscode.Uri
          ? target
          : target && typeof target === 'object' && 'uri' in target
            ? (target as { uri: vscode.Uri }).uri
            : undefined;

      if (!uri || !uri.fsPath.toLowerCase().endsWith('.pdf')) {
        vscode.window.showErrorMessage(vscode.l10n.t('Open a Factur-X PDF file first.'));
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', uri, PdfXmlEditorProvider.viewType);
    }),
  );
}

export function deactivate(): void {}
