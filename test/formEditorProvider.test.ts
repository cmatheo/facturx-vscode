import { describe, expect, it } from 'vitest';
import { FacturXFormPanelManager } from '../src/formEditorProvider';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { Uri } from 'vscode';

/**
 * The webview's client script is authored as plain JS text embedded inside an
 * untagged TypeScript template literal (see FacturXFormPanelManager.renderHtml).
 * TypeScript silently drops backslashes from unrecognized escape sequences (e.g.
 * "\d", "\/") when compiling such literals, which previously corrupted every regex
 * literal in the emitted script (a real incident: /^(\d{2})\/(\d{2})\/(\d{4})$/
 * came out as /^(d{2})/(d{2})/(d{4})$/, a syntax error VS Code surfaced as a
 * confusing "Failed to execute 'write' on 'Document'" in the webview console,
 * leaving the whole form blank). This guards against that class of regression by
 * actually parsing the rendered script as JavaScript.
 */
describe('FacturXFormPanelManager.renderHtml', () => {
  function renderedScript(): string {
    const manager = new FacturXFormPanelManager(Uri.file('/tmp'));
    const html = (manager as unknown as { renderHtml(): string }).renderHtml();
    const match = /<script nonce="[^"]*">([\s\S]*?)<\/script>/.exec(html);
    if (!match) {
      throw new Error('Could not find the webview <script> block in the rendered HTML');
    }
    return match[1];
  }

  it('produces a webview script that is syntactically valid JavaScript', () => {
    const script = renderedScript();
    expect(() => new Function(script)).not.toThrow();
  });

  it('does not contain regex literals with escape backslashes stripped by the outer template literal', () => {
    const script = renderedScript();
    expect(script).toContain('\\d{2}');
    expect(script).toContain('\\d{4}');
  });

  it('produces well-formed, non-empty HTML with the expected structural elements', () => {
    const manager = new FacturXFormPanelManager(Uri.file('/tmp'));
    const html = (manager as unknown as { renderHtml(): string }).renderHtml();
    expect(html).toContain('id="profile"');
    expect(html).toContain('id="groups"');
    expect(html).toContain('id="applyBtn"');
  });
});
