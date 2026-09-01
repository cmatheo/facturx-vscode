import * as vscode from 'vscode';
import { FacturXProfile, facturXProfileLabel } from './facturxProfile';
import {
  FIELD_DEFS,
  LINE_ITEM_FIELD_DEFS,
  LINE_ITEMS_AVAILABLE_FROM,
  VAT_BREAKDOWN_FIELD_DEFS,
  VAT_BREAKDOWN_AVAILABLE_FROM,
  buildCiiInvoiceXml,
  extractFieldValues,
  extractLineItems,
  extractVatBreakdown,
} from './facturxFields';

const ALL_PROFILES: FacturXProfile[] = ['minimum', 'basicwl', 'basic', 'en16931', 'extended'];

interface PanelEntry {
  panel: vscode.WebviewPanel;
  xmlUri: vscode.Uri;
}

/**
 * Manages the "field form" webview panel that lets a user build/edit a CII invoice
 * from labeled inputs instead of raw XML, one panel per open PDF. Applying the form
 * writes into the XML document via a WorkspaceEdit, so undo, dirty-tracking and the
 * existing debounced XSD validation all keep working unchanged.
 */
export class FacturXFormPanelManager {
  private readonly panels = new Map<string, PanelEntry>();

  constructor(private readonly extensionUri: vscode.Uri) {}

  /** Whether a field-form panel is already registered (alive or not yet confirmed disposed) for this PDF. */
  has(pdfUri: vscode.Uri): boolean {
    return this.panels.has(pdfUri.toString());
  }

  async show(pdfUri: vscode.Uri, xmlUri: vscode.Uri, column: vscode.ViewColumn): Promise<void> {
    const key = pdfUri.toString();
    const existing = this.panels.get(key);
    if (existing) {
      existing.xmlUri = xmlUri;
      try {
        existing.panel.reveal(column, true);
        await this.postInitialValues(existing);
        return;
      } catch {
        // The panel object is stale (its underlying webview was torn down, e.g. by
        // an editor layout change) but onDidDispose hasn't fired yet - drop it and
        // fall through to create a fresh one below instead of writing to a dead
        // webview (which throws/EPIPEs).
        this.panels.delete(key);
      }
    }

    const panel = vscode.window.createWebviewPanel(
      'facturx.fieldForm',
      vscode.l10n.t('Factur-X Fields'),
      { viewColumn: column, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
      },
    );
    panel.webview.html = this.renderHtml(panel.webview);

    const entry: PanelEntry = { panel, xmlUri };
    this.panels.set(key, entry);

    panel.onDidDispose(() => {
      // Only clear the map entry if it's still pointing at *this* panel - a stale
      // dispose event firing after a newer panel has already replaced this one for
      // the same PDF must not evict the live panel.
      if (this.panels.get(key)?.panel === panel) {
        this.panels.delete(key);
      }
    });

    panel.webview.onDidReceiveMessage(async (message) => {
      const current = this.panels.get(key);
      if (!current) {
        return;
      }
      try {
        if (message?.type === 'ready' || message?.type === 'reload') {
          await this.postInitialValues(current);
        } else if (message?.type === 'apply') {
          await this.applyXml(
            current.xmlUri,
            message.profile,
            message.values,
            message.lineItems ?? [],
            message.vatBreakdown ?? [],
          );
        } else if (message?.type === 'error') {
          vscode.window.showErrorMessage(
            vscode.l10n.t('Factur-X field form error: {0}', String(message.message)),
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          vscode.l10n.t('Factur-X field form failed to update: {0}', String(error)),
        );
      }
    });

    await this.postInitialValues(entry);
  }

  private async postInitialValues(entry: PanelEntry): Promise<void> {
    let xml = '';
    try {
      const document = await vscode.workspace.openTextDocument(entry.xmlUri);
      xml = document.getText();
    } catch {
      // No document yet (e.g. panel created before the XML doc opened); form starts blank.
    }

    let values: Record<string, string> = {};
    let lineItems: Array<Record<string, string>> = [];
    let vatBreakdown: Array<Record<string, string>> = [];
    try {
      values = xml ? extractFieldValues(xml) : {};
      lineItems = xml ? extractLineItems(xml) : [];
      vatBreakdown = xml ? extractVatBreakdown(xml) : [];
    } catch (error) {
      vscode.window.showErrorMessage(
        vscode.l10n.t('Failed to read current field values from the XML: {0}', String(error)),
      );
    }

    await entry.panel.webview.postMessage({
      type: 'init',
      fields: FIELD_DEFS.map((field) => ({
        id: field.id,
        group: field.group,
        label: field.label,
        description: field.description,
        type: field.type,
        default: field.default,
        mandatoryFor: field.mandatoryFor,
        availableFrom: field.availableFrom ?? 'minimum',
      })),
      profiles: ALL_PROFILES.map((profile) => ({ value: profile, label: facturXProfileLabel(profile) })),
      values,
      lineItemFields: LINE_ITEM_FIELD_DEFS.map((field) => ({
        id: field.id,
        label: field.label,
        description: field.description,
        type: field.type,
        default: field.default,
      })),
      lineItemsAvailableFrom: LINE_ITEMS_AVAILABLE_FROM,
      lineItems,
      vatBreakdownFields: VAT_BREAKDOWN_FIELD_DEFS.map((field) => ({
        id: field.id,
        label: field.label,
        description: field.description,
        type: field.type,
        default: field.default,
      })),
      vatBreakdownAvailableFrom: VAT_BREAKDOWN_AVAILABLE_FROM,
      vatBreakdown,
    });
  }

  private async applyXml(
    xmlUri: vscode.Uri,
    profile: FacturXProfile,
    values: Record<string, string>,
    lineItems: Array<Record<string, string>>,
    vatBreakdown: Array<Record<string, string>>,
  ): Promise<void> {
    const document = await vscode.workspace.openTextDocument(xmlUri);
    const xml = buildCiiInvoiceXml(profile, values, lineItems, vatBreakdown);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(xmlUri, new vscode.Range(0, 0, document.lineCount, 0), xml);
    await vscode.workspace.applyEdit(edit);
  }

  /**
   * The webview's CSS/JS live as plain static files under media/ (not embedded as TS
   * template-literal text) so they're real, directly-lintable/parseable CSS and JS -
   * this used to be one large embedded template literal, which twice caused subtle
   * corruption (TypeScript stripping unrecognized escape sequences, and a stray
   * backtick in a comment closing the literal early) that only surfaced as a blank
   * webview at runtime.
   */
  private renderHtml(webview: vscode.Webview): string {
    const nonce = generateNonce();
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'formEditorPanel.css'),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'formEditorPanel.js'),
    );
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource};" />
<link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div id="topBar">
    <label>Profile: <select id="profile"></select></label>
    <label><input type="checkbox" id="allowMissing" /> Allow missing mandatory fields (build intentionally invalid XML for testing)</label>
    <button id="applyBtn">Apply to XML</button>
    <button id="reloadBtn">Reload from XML</button>
    <span id="warning"></span>
  </div>
  <div id="groups"></div>
  <fieldset id="lineItemsSection" class="repeatableSection">
    <legend>Invoice lines</legend>
    <table id="lineItemsTable" class="repeatableTable">
      <thead><tr id="lineItemsHeaderRow"></tr></thead>
      <tbody id="lineItemsBody"></tbody>
    </table>
    <button id="addLineBtn" class="addRowBtn">Add line</button>
  </fieldset>
  <fieldset id="vatSection" class="repeatableSection">
    <legend>VAT breakdown</legend>
    <table id="vatTable" class="repeatableTable">
      <thead><tr id="vatHeaderRow"></tr></thead>
      <tbody id="vatBody"></tbody>
    </table>
    <button id="addVatBtn" class="addRowBtn">Add VAT rate</button>
  </fieldset>
  <script nonce="${nonce}" src="${scriptUri}"></script>
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
