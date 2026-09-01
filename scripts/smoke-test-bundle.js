// Smoke test: require() the real bundled out/extension.js under a minimal fake
// 'vscode' module and call activate()/deactivate() to confirm the esbuild bundle
// doesn't crash at load or activation time - the one class of bug esbuild bundling
// could introduce (a broken external/disk-path reference) that `tsc`/vitest can't
// catch, since vitest imports src/*.ts directly rather than the built bundle. This
// is NOT a substitute for a real Extension Development Host run (no UI, no webview
// creation, no real PDF opened) - run `pnpm run build` first, then `node
// scripts/smoke-test-bundle.js`.
const Module = require('module');
const path = require('path');
const repoRoot = path.resolve(__dirname, '..');

class Uri {
  constructor(fsPath) {
    this.fsPath = fsPath;
  }
  static file(fsPath) {
    return new Uri(fsPath);
  }
  static joinPath(base, ...segments) {
    return new Uri(path.join(base.fsPath, ...segments));
  }
  toString() {
    return `file://${this.fsPath}`;
  }
}
class TabInputText {}
class TabInputCustom {}
class FakeDisposable {}
class EventEmitter {
  event = () => new FakeDisposable();
  fire() {}
}

const fakeVscode = {
  Uri,
  TabInputText,
  TabInputCustom,
  Disposable: FakeDisposable,
  EventEmitter,
  ViewColumn: { One: 1, Two: 2, Three: 3 },
  FileType: { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 },
  workspace: {
    registerFileSystemProvider: () => new FakeDisposable(),
    fs: { readFile: async () => new Uint8Array(), writeFile: async () => {} },
    openTextDocument: async () => ({ getText: () => '' }),
    applyEdit: async () => true,
    onDidOpenTextDocument: () => new FakeDisposable(),
    onDidChangeTextDocument: () => new FakeDisposable(),
    onDidCloseTextDocument: () => new FakeDisposable(),
    textDocuments: [],
  },
  window: {
    registerCustomEditorProvider: (viewType, provider) => {
      if (
        typeof provider.openCustomDocument !== 'function' ||
        typeof provider.resolveCustomEditor !== 'function'
      ) {
        throw new Error(`registerCustomEditorProvider: provider for ${viewType} is missing required methods`);
      }
      return new FakeDisposable();
    },
    createWebviewPanel: () => ({
      webview: { html: '', onDidReceiveMessage: () => new FakeDisposable(), postMessage: async () => true },
      onDidDispose: () => new FakeDisposable(),
      reveal: () => {},
    }),
    tabGroups: { activeTabGroup: { activeTab: undefined }, all: [], close: async () => {} },
    activeTextEditor: undefined,
    showErrorMessage: () => {},
    showInformationMessage: () => {},
    setStatusBarMessage: () => {},
  },
  commands: {
    registerCommand: () => new FakeDisposable(),
    executeCommand: async () => {},
  },
  languages: {
    createDiagnosticCollection: () => ({ set: () => {}, delete: () => {}, dispose: () => {} }),
    setTextDocumentLanguage: async () => {},
  },
  l10n: { t: (s) => s },
  WorkspaceEdit: class {
    replace() {}
  },
  Range: class {
    constructor(...args) {
      this.args = args;
    }
  },
  Diagnostic: class {
    constructor(range, message, severity) {
      Object.assign(this, { range, message, severity });
    }
  },
  DiagnosticSeverity: { Error: 0, Warning: 1 },
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'vscode') {
    return 'FAKE_VSCODE';
  }
  return originalResolve.call(this, request, ...args);
};
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'vscode') {
    return fakeVscode;
  }
  return originalLoad.call(this, request, ...args);
};

const ext = require(path.join(repoRoot, 'out', 'extension.js'));
console.log('Loaded exports:', Object.keys(ext));
if (typeof ext.activate !== 'function' || typeof ext.deactivate !== 'function') {
  throw new Error('activate/deactivate not exported as functions');
}

const context = { subscriptions: [], extensionUri: Uri.file(repoRoot) };
ext.activate(context);
console.log('activate() ran without throwing. subscriptions pushed:', context.subscriptions.length);
ext.deactivate();
console.log('deactivate() ran without throwing.');
console.log('SMOKE TEST PASSED');
