import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  // TODO: register the CustomEditorProvider for the side-by-side PDF/XML view
  console.log(vscode.l10n.t('Factur-X Viewer activated'));
}

export function deactivate() {}
