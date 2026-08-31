import * as vscode from 'vscode';
import { detectFacturXProfile, facturXProfileLabel } from './facturxProfile';
import { validateAgainstXsd } from './xsdValidator';
import { XML_SCHEME } from './xmlFileSystemProvider';

const DEBOUNCE_MS = 400;

/**
 * Wires up debounced XSD validation for facturx-xml: documents, surfacing errors
 * as standard VS Code diagnostics. One collection is shared across all open XML panes.
 */
export function registerXmlValidation(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('facturx');
  context.subscriptions.push(diagnostics);

  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function scheduleValidation(document: vscode.TextDocument): void {
    if (document.uri.scheme !== XML_SCHEME) {
      return;
    }
    const key = document.uri.toString();
    const existing = timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        void validateDocument(context.extensionUri, document, diagnostics);
      }, DEBOUNCE_MS),
    );
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(scheduleValidation),
    vscode.workspace.onDidChangeTextDocument((event) => scheduleValidation(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnostics.delete(document.uri);
      const key = document.uri.toString();
      const existing = timers.get(key);
      if (existing) {
        clearTimeout(existing);
        timers.delete(key);
      }
    }),
  );

  for (const document of vscode.workspace.textDocuments) {
    scheduleValidation(document);
  }
}

async function validateDocument(
  extensionUri: vscode.Uri,
  document: vscode.TextDocument,
  diagnostics: vscode.DiagnosticCollection,
): Promise<void> {
  const xml = document.getText();
  const profile = detectFacturXProfile(xml);

  if (!profile) {
    diagnostics.set(document.uri, [
      new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 0),
        vscode.l10n.t(
          'Could not detect the Factur-X profile from GuidelineSpecifiedDocumentContextParameter/ID; skipping XSD validation.',
        ),
        vscode.DiagnosticSeverity.Warning,
      ),
    ]);
    return;
  }

  try {
    const errors = await validateAgainstXsd(extensionUri, profile, xml);
    if (document.getText() !== xml) {
      // Document changed again while validation was running; a newer run will supersede this one.
      return;
    }
    diagnostics.set(
      document.uri,
      errors.map((error) => {
        const line = error.line !== undefined ? Math.max(0, error.line - 1) : 0;
        const range = document.validateRange(new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER));
        return new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error);
      }),
    );
    if (errors.length === 0) {
      void vscode.window.setStatusBarMessage(
        vscode.l10n.t('Factur-X: valid against {0} schema', facturXProfileLabel(profile)),
        3000,
      );
    }
  } catch (error) {
    diagnostics.set(document.uri, [
      new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 0),
        vscode.l10n.t('XSD validation failed to run: {0}', String(error)),
        vscode.DiagnosticSeverity.Error,
      ),
    ]);
  }
}
