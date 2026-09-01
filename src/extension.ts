import * as vscode from 'vscode';
import { PdfXmlEditorProvider } from './pdfEditorProvider';
import { upsertEmbeddedXml } from './pdfAttachment';
import { FacturXXmlFileSystemProvider, XML_SCHEME } from './xmlFileSystemProvider';
import { registerXmlValidation } from './xmlValidation';
import { FacturXFormPanelManager } from './formEditorProvider';

export function activate(context: vscode.ExtensionContext): void {
  const xmlFs = new FacturXXmlFileSystemProvider();
  const formPanels = new FacturXFormPanelManager(context.extensionUri);

  registerXmlValidation(context);

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(XML_SCHEME, xmlFs, {
      isCaseSensitive: true,
    }),
    vscode.window.registerCustomEditorProvider(
      PdfXmlEditorProvider.viewType,
      new PdfXmlEditorProvider(context.extensionUri, xmlFs, formPanels),
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    xmlFs.onDidSaveXml(async ({ pdfUri, attachmentName, content }) => {
      try {
        const pdfBytes = await vscode.workspace.fs.readFile(pdfUri);
        const updatedPdf = await upsertEmbeddedXml(pdfBytes, attachmentName, content);
        await vscode.workspace.fs.writeFile(pdfUri, updatedPdf);
      } catch (error) {
        vscode.window.showErrorMessage(
          vscode.l10n.t('Failed to save XML back into {0}: {1}', pdfUri.fsPath, String(error)),
        );
      }
    }),
    vscode.commands.registerCommand('facturx.openInEditor', async (resourceUri?: vscode.Uri) => {
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
      const uri =
        resourceUri ?? tabInputUri(activeTab?.input) ?? vscode.window.activeTextEditor?.document.uri;

      if (!uri || !uri.fsPath.toLowerCase().endsWith('.pdf')) {
        vscode.window.showErrorMessage(vscode.l10n.t('Open a Factur-X PDF file first.'));
        return;
      }

      // Close every existing tab for this resource, in any group, before reopening it with
      // our editor: vscode.openWith adds a new tab rather than replacing an existing one for
      // the same resource (in particular it doesn't consume an existing preview/italic tab),
      // so without this step you end up with duplicate tabs for the same PDF.
      const existingTabs = vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .filter((tab) => tabInputUri(tab.input)?.toString() === uri.toString());
      const column = existingTabs[0]?.group.viewColumn;
      if (existingTabs.length > 0) {
        await vscode.window.tabGroups.close(existingTabs);
      }

      await vscode.commands.executeCommand('vscode.openWith', uri, PdfXmlEditorProvider.viewType, column);
    }),
    vscode.commands.registerCommand('facturx.showFieldForm', async () => {
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
      const activeUri = tabInputUri(activeTab?.input) ?? vscode.window.activeTextEditor?.document.uri;
      if (!activeUri) {
        vscode.window.showErrorMessage(vscode.l10n.t('Open a Factur-X PDF file first.'));
        return;
      }

      const pdfUri = activeUri.scheme === XML_SCHEME ? xmlFs.pdfUriFor(activeUri) : activeUri;
      const xmlUri = pdfUri ? xmlFs.xmlUriFor(pdfUri) : undefined;
      if (!pdfUri || !xmlUri) {
        vscode.window.showErrorMessage(
          vscode.l10n.t('No Factur-X field form is available for the active editor.'),
        );
        return;
      }

      await formPanels.show(pdfUri, xmlUri, vscode.ViewColumn.Three);
    }),
  );
}

function tabInputUri(input: unknown): vscode.Uri | undefined {
  if (input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom) {
    return input.uri;
  }
  return undefined;
}

export function deactivate(): void {}
