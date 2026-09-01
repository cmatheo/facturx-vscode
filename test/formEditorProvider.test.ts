import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FacturXFormPanelManager } from '../src/formEditorProvider';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { Uri } from 'vscode';

/**
 * The webview's CSS/JS are static files under media/, referenced from the rendered
 * HTML via webview.asWebviewUri rather than embedded as TS template-literal text (a
 * real incident: TypeScript silently drops backslashes from unrecognized escape
 * sequences - e.g. "\d", "\/" - when compiling such literals, which once corrupted
 * every regex literal in the embedded script; a later regression struck the same
 * literal via a stray backtick inside a comment. Moving the JS to a real .js file
 * removes that whole class of bug). This guards the split: the script file must
 * still be syntactically valid JS, and renderHtml must still wire it up correctly.
 */
describe('FacturXFormPanelManager.renderHtml', () => {
  const fakeWebview = {
    cspSource: 'vscode-webview://test',
    asWebviewUri: (uri: Uri) => Uri.file(`vscode-resource:${uri.fsPath}`),
  } as unknown as import('vscode').Webview;

  function renderedHtml(): string {
    const manager = new FacturXFormPanelManager(Uri.file(path.resolve(__dirname, '..')));
    return (manager as unknown as { renderHtml(webview: unknown): string }).renderHtml(fakeWebview);
  }

  it('produces the webview media/formEditorPanel.js file as syntactically valid JavaScript', () => {
    const script = fs.readFileSync(
      path.resolve(__dirname, '..', 'media', 'formEditorPanel.js'),
      'utf-8',
    );
    expect(() => new Function(script)).not.toThrow();
  });

  it('does not contain regex literals with escape backslashes stripped (the original incident)', () => {
    const script = fs.readFileSync(
      path.resolve(__dirname, '..', 'media', 'formEditorPanel.js'),
      'utf-8',
    );
    expect(script).toContain('\\d{2}');
    expect(script).toContain('\\d{4}');
  });

  it('references the external stylesheet and script via webview.asWebviewUri', () => {
    const html = renderedHtml();
    expect(html).toContain('<link rel="stylesheet" href="');
    expect(html).toContain('formEditorPanel.css');
    expect(html).toMatch(/<script nonce="[^"]*" src="[^"]*formEditorPanel\.js"><\/script>/);
  });

  it('produces well-formed, non-empty HTML with the expected structural elements', () => {
    const html = renderedHtml();
    expect(html).toContain('id="profile"');
    expect(html).toContain('id="groups"');
    expect(html).toContain('id="applyBtn"');
  });
});
