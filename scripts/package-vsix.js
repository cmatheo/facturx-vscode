// Packages the .vsix, then hand-adds the handful of runtime files that must ship as
// real files on disk (not bundled - see esbuild.js) but that `vsce package`'s
// automatic node_modules dependency-detection can't be made to trim reliably: it
// either includes a package's entire tree (tens of MB of unused pdfjs-dist build
// variants/source maps/types, plus stray peerDependency packages like @types/node)
// or, with --no-dependencies, skips node_modules entirely regardless of .vscodeignore
// negation patterns (tested empirically - neither this project's .vscodeignore rules
// nor `--allow-*` flags changed that). Packaging with --no-dependencies and then
// splicing in exactly the needed files ourselves is the reliable alternative.
//
// Needed files:
// - node_modules/xmllint-wasm/{package.json,index-node.js,xmllint-node.js,xmllint.wasm}
//   xmllint-wasm's validateXML() spawns a worker_threads Worker pointing at
//   xmllint-node.js by disk path (resolved via that file's own __dirname), which
//   itself loads xmllint.wasm the same way - both need real files on disk under a
//   real node_modules/xmllint-wasm (package.json is required too: Node's resolver
//   needs its "main" field to find index-node.js, since the entry file isn't named
//   index.js).
// - node_modules/pdfjs-dist/legacy/build/{pdf.mjs,pdf.worker.mjs}: the only 2
//   pdfjs-dist files actually referenced (by disk path, not `require`, then served to
//   the webview via asWebviewUri) - see src/pdfEditorProvider.ts's PDFJS_BUILD_PATH.
//   No package.json needed here since this is never resolved via `require`.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const repoRoot = path.resolve(__dirname, '..');
const outVsix = process.argv[2] || 'facturx-vscode.vsix';

function sh(cmd, args, options = {}) {
  console.log('>', cmd, args.join(' '));
  execFileSync(cmd, args, { stdio: 'inherit', cwd: repoRoot, ...options });
}

sh('pnpm', ['exec', 'vsce', 'package', '--no-dependencies', '--no-rewrite-relative-links', '-o', outVsix], {
  env: { ...process.env, COREPACK_ENABLE_STRICT: '0' },
});

const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'facturx-vsix-vendor-'));
const vendorFiles = [
  ['node_modules/xmllint-wasm/package.json', 'node_modules/xmllint-wasm/package.json'],
  ['node_modules/xmllint-wasm/index-node.js', 'node_modules/xmllint-wasm/index-node.js'],
  ['node_modules/xmllint-wasm/xmllint-node.js', 'node_modules/xmllint-wasm/xmllint-node.js'],
  ['node_modules/xmllint-wasm/xmllint.wasm', 'node_modules/xmllint-wasm/xmllint.wasm'],
  ['node_modules/pdfjs-dist/legacy/build/pdf.mjs', 'node_modules/pdfjs-dist/legacy/build/pdf.mjs'],
  [
    'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
  ],
];

for (const [src, dest] of vendorFiles) {
  const srcPath = path.join(repoRoot, src);
  const destPath = path.join(staging, 'extension', dest);
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Expected runtime file missing: ${src} (was \`pnpm install\` run?)`);
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
}

sh('zip', ['-r', path.join(repoRoot, outVsix), 'extension'], { cwd: staging });
fs.rmSync(staging, { recursive: true, force: true });

console.log(`\nDone: ${outVsix} now includes the vendored xmllint-wasm/pdfjs-dist runtime files.`);
