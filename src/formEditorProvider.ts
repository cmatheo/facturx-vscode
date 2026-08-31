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
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.html = this.renderHtml();

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

  private renderHtml(): string {
    const nonce = generateNonce();
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 8px 12px; font-size: 13px; }
  #topBar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; position: sticky; top: 0; background: var(--vscode-editor-background); padding: 4px 0; z-index: 1; }
  select, input[type="text"], input[type="date"], input[type="number"] {
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; padding: 3px 6px; width: 100%; box-sizing: border-box;
  }
  fieldset { border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin-bottom: 10px; }
  legend { padding: 0 6px; font-weight: 600; }
  .field { margin-bottom: 8px; }
  .field label { display: flex; justify-content: space-between; gap: 6px; margin-bottom: 2px; }
  .field .name { cursor: help; }
  .mandatory { color: var(--vscode-editorError-foreground, #f14c4c); font-size: 11px; }
  .optional { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .field.missing input { border-color: var(--vscode-editorError-foreground, #f14c4c); }
  .field input:disabled { opacity: 0.5; }
  button { cursor: pointer; padding: 4px 10px; }
  #applyBtn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; }
  #applyBtn:disabled { opacity: 0.5; cursor: not-allowed; }
  #warning { color: var(--vscode-editorWarning-foreground, #cca700); font-size: 12px; }
  #grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0 16px; }
  .repeatableSection { margin-bottom: 10px; }
  .repeatableSection.unavailable { opacity: 0.5; }
  .repeatableTable { width: 100%; border-collapse: collapse; }
  .repeatableTable th { text-align: left; font-weight: 600; font-size: 11px; color: var(--vscode-descriptionForeground); padding: 2px 4px; }
  .repeatableTable td { padding: 2px 4px; }
  .repeatableTable input { min-width: 70px; }
  .repeatableTable .rowRemoveBtn { color: var(--vscode-editorError-foreground, #f14c4c); background: none; border: none; }
  .repeatableSection button.addRowBtn { margin-top: 4px; }
</style>
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
  <script nonce="${nonce}">
    const vscodeApi = acquireVsCodeApi();
    window.addEventListener('error', (event) => {
      vscodeApi.postMessage({ type: 'error', message: String(event.error?.stack || event.message) });
    });

    let fields = [];
    let profiles = [];
    let values = {};
    let lineItemFields = [];
    let lineItemsAvailableFrom = 'basic';
    let lineItems = [];
    let vatBreakdownFields = [];
    let vatBreakdownAvailableFrom = 'basicwl';
    let vatBreakdown = [];

    const profileSelect = document.getElementById('profile');
    const allowMissingCheckbox = document.getElementById('allowMissing');
    const groupsEl = document.getElementById('groups');
    const applyBtn = document.getElementById('applyBtn');
    const warningEl = document.getElementById('warning');
    const lineItemsSection = document.getElementById('lineItemsSection');
    const lineItemsHeaderRow = document.getElementById('lineItemsHeaderRow');
    const lineItemsBody = document.getElementById('lineItemsBody');
    const addLineBtn = document.getElementById('addLineBtn');
    const vatSection = document.getElementById('vatSection');
    const vatHeaderRow = document.getElementById('vatHeaderRow');
    const vatBody = document.getElementById('vatBody');
    const addVatBtn = document.getElementById('addVatBtn');

    function currentProfile() {
      return profileSelect.value;
    }

    const PROFILE_ORDER = ['minimum', 'basicwl', 'basic', 'en16931', 'extended'];

    // Date fields are kept in the UI as DD/MM/YYYY text (the native <input type="date">
    // always renders per the browser/OS locale - typically MM/DD/YYYY - with no way to
    // force DD/MM/YYYY) and are converted to/from the CII udt:DateTimeString storage
    // format (format="102", i.e. plain YYYYMMDD) only at the init/apply boundaries.
    function storageToDisplay(stored) {
      const match = /^(\\d{4})(\\d{2})(\\d{2})$/.exec((stored || '').trim());
      if (!match) { return stored || ''; }
      const [, yyyy, mm, dd] = match;
      return dd + '/' + mm + '/' + yyyy;
    }

    function displayToStorage(display) {
      const match = /^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/.exec((display || '').trim());
      if (!match) { return display || ''; }
      const [, dd, mm, yyyy] = match;
      return yyyy + mm + dd;
    }

    function isMandatory(field) {
      return field.mandatoryFor.includes(currentProfile());
    }

    function isProfileAtLeast(from) {
      return PROFILE_ORDER.indexOf(currentProfile()) >= PROFILE_ORDER.indexOf(from || 'minimum');
    }

    function isAvailable(field) {
      return isProfileAtLeast(field.availableFrom);
    }

    function lineItemsAvailable() {
      return isProfileAtLeast(lineItemsAvailableFrom);
    }

    function vatBreakdownAvailable() {
      return isProfileAtLeast(vatBreakdownAvailableFrom);
    }

    function rowHasAnyValue(fieldsList, item) {
      return fieldsList.some((f) => (item[f.id] || '').trim() !== '');
    }

    function render() {
      groupsEl.innerHTML = '';
      const byGroup = new Map();
      for (const field of fields) {
        if (!byGroup.has(field.group)) { byGroup.set(field.group, []); }
        byGroup.get(field.group).push(field);
      }
      for (const [groupName, groupFields] of byGroup) {
        const fieldset = document.createElement('fieldset');
        const legend = document.createElement('legend');
        legend.textContent = groupName;
        fieldset.appendChild(legend);
        const grid = document.createElement('div');
        grid.id = 'grid';
        for (const field of groupFields) {
          grid.appendChild(renderField(field));
        }
        fieldset.appendChild(grid);
        groupsEl.appendChild(fieldset);
      }
      renderLineItems();
      renderVatBreakdown();
      updateValidity();
    }

    // Shared renderer for both "zero or more rows" sections (invoice lines, VAT
    // breakdown): builds a header row from fieldsList's labels and one table row per
    // entry in itemsList, mutating itemsList in place (push/splice) rather than
    // reassigning it, so the caller's own lineItems/vatBreakdown variable binding
    // stays valid across re-renders.
    function renderRepeatableTable(fieldsList, itemsList, available, headerRowEl, bodyEl, onChange) {
      headerRowEl.innerHTML = '';
      for (const field of fieldsList) {
        const th = document.createElement('th');
        th.textContent = field.label;
        th.title = field.description;
        headerRowEl.appendChild(th);
      }
      headerRowEl.appendChild(document.createElement('th'));

      bodyEl.innerHTML = '';
      itemsList.forEach((item, index) => {
        const row = document.createElement('tr');
        for (const field of fieldsList) {
          const td = document.createElement('td');
          const input = document.createElement('input');
          input.type = field.type === 'number' ? 'text' : field.type;
          input.value = item[field.id] ?? field.default ?? '';
          input.placeholder = field.default ?? '';
          input.disabled = !available;
          input.addEventListener('input', () => {
            item[field.id] = input.value;
            updateValidity();
          });
          td.appendChild(input);
          row.appendChild(td);
        }
        const removeTd = document.createElement('td');
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'rowRemoveBtn';
        removeBtn.textContent = 'x';
        removeBtn.title = 'Remove this row';
        removeBtn.addEventListener('click', () => {
          itemsList.splice(index, 1);
          onChange();
          updateValidity();
        });
        removeTd.appendChild(removeBtn);
        row.appendChild(removeTd);
        bodyEl.appendChild(row);
      });
    }

    function renderLineItems() {
      const available = lineItemsAvailable();
      lineItemsSection.classList.toggle('unavailable', !available);
      addLineBtn.disabled = !available;
      renderRepeatableTable(lineItemFields, lineItems, available, lineItemsHeaderRow, lineItemsBody, renderLineItems);
    }

    function renderVatBreakdown() {
      const available = vatBreakdownAvailable();
      vatSection.classList.toggle('unavailable', !available);
      addVatBtn.disabled = !available;
      renderRepeatableTable(vatBreakdownFields, vatBreakdown, available, vatHeaderRow, vatBody, renderVatBreakdown);
    }

    function renderField(field) {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      wrap.dataset.fieldId = field.id;

      const label = document.createElement('label');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = field.label;
      name.title = field.description;
      label.appendChild(name);

      const available = isAvailable(field);
      const badge = document.createElement('span');
      badge.className = !available ? 'optional' : (isMandatory(field) ? 'mandatory' : 'optional');
      badge.textContent = !available ? 'not in this profile' : (isMandatory(field) ? 'required' : 'optional');
      label.appendChild(badge);
      wrap.appendChild(label);

      const isDate = field.type === 'date';
      const input = document.createElement('input');
      input.type = field.type === 'number' || isDate ? 'text' : field.type;
      input.value = isDate
        ? storageToDisplay(values[field.id] ?? field.default ?? '')
        : (values[field.id] ?? field.default ?? '');
      input.placeholder = isDate ? 'DD/MM/YYYY' : (field.default ?? '');
      input.disabled = !available;
      input.title = available ? '' : 'This field does not apply to the selected profile and will be ignored.';
      input.addEventListener('input', () => {
        values[field.id] = input.value;
        updateValidity();
      });
      wrap.appendChild(input);

      return wrap;
    }

    function updateValidity() {
      const allowMissing = allowMissingCheckbox.checked;
      let missing = [];
      for (const field of fields) {
        const el = groupsEl.querySelector('[data-field-id="' + field.id + '"]');
        if (!el) { continue; }
        if (!isAvailable(field)) {
          el.classList.remove('missing');
          continue;
        }
        const empty = !(values[field.id] ?? '').trim();
        const mandatory = isMandatory(field);
        el.classList.toggle('missing', mandatory && empty && !allowMissing);
        if (mandatory && empty) { missing.push(field.label); }
      }
      if (lineItemsAvailable() && !lineItems.some((line) => rowHasAnyValue(lineItemFields, line))) {
        missing.push('at least one invoice line');
      }
      if (vatBreakdownAvailable() && !vatBreakdown.some((entry) => rowHasAnyValue(vatBreakdownFields, entry))) {
        missing.push('at least one VAT breakdown row');
      }
      if (allowMissing) {
        applyBtn.disabled = false;
        warningEl.textContent = missing.length ? ('Will omit: ' + missing.join(', ')) : '';
      } else {
        applyBtn.disabled = missing.length > 0;
        warningEl.textContent = missing.length ? ('Missing required: ' + missing.join(', ')) : '';
      }
    }

    profileSelect.addEventListener('change', render);
    allowMissingCheckbox.addEventListener('change', updateValidity);
    addLineBtn.addEventListener('click', () => {
      lineItems.push({});
      renderLineItems();
      updateValidity();
    });
    addVatBtn.addEventListener('click', () => {
      vatBreakdown.push({});
      renderVatBreakdown();
      updateValidity();
    });

    applyBtn.addEventListener('click', () => {
      const payload = Object.assign({}, values);
      for (const field of fields) {
        if (field.type === 'date' && payload[field.id] !== undefined) {
          payload[field.id] = displayToStorage(payload[field.id]);
        }
      }
      const linesPayload = lineItems.filter((line) => rowHasAnyValue(lineItemFields, line));
      const vatPayload = vatBreakdown.filter((entry) => rowHasAnyValue(vatBreakdownFields, entry));
      vscodeApi.postMessage({
        type: 'apply',
        profile: currentProfile(),
        values: payload,
        lineItems: linesPayload,
        vatBreakdown: vatPayload,
      });
    });
    document.getElementById('reloadBtn').addEventListener('click', () => {
      vscodeApi.postMessage({ type: 'reload' });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type !== 'init') { return; }
      fields = message.fields;
      profiles = message.profiles;
      values = Object.assign({}, message.values);
      lineItemFields = message.lineItemFields || [];
      lineItemsAvailableFrom = message.lineItemsAvailableFrom || 'basic';
      lineItems = (message.lineItems || []).map((line) => Object.assign({}, line));
      vatBreakdownFields = message.vatBreakdownFields || [];
      vatBreakdownAvailableFrom = message.vatBreakdownAvailableFrom || 'basicwl';
      vatBreakdown = (message.vatBreakdown || []).map((entry) => Object.assign({}, entry));
      const previousProfile = profileSelect.value;
      profileSelect.innerHTML = '';
      for (const p of profiles) {
        const opt = document.createElement('option');
        opt.value = p.value;
        opt.textContent = p.label;
        profileSelect.appendChild(opt);
      }
      profileSelect.value = previousProfile && profiles.some((p) => p.value === previousProfile)
        ? previousProfile
        : profiles[0].value;
      render();
    });

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
