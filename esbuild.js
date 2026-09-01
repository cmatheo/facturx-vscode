// Bundles the extension host (src/extension.ts and everything it imports) into a
// single out/extension.js. Kept external:
// - 'vscode': provided by the VS Code runtime, never bundled.
// - 'xmllint-wasm': its validateXML() spawns a worker_threads Worker pointing at a
//   real file on disk (node_modules/xmllint-wasm/xmllint-node.js, resolved via that
//   file's own __dirname), which itself loads xmllint.wasm the same way. Both paths
//   only work if xmllint-wasm's real files stay on disk under node_modules/ - bundling
//   would break the Worker's __dirname resolution entirely. See .vscodeignore for how
//   just this one package is still shipped whole in the packaged .vsix.
// pdf-lib has no such disk/worker dependency (it's pure computation) and is bundled
// inline. pdfjs-dist is never `require()`d by the extension host at all - only its
// browser build files (legacy/build/pdf.mjs, pdf.worker.mjs) are referenced by disk
// path and served to the webview - so it never enters this bundle's module graph;
// see .vscodeignore for how only those 2 files (not the whole package) get shipped.
const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    outfile: 'out/extension.js',
    external: ['vscode', 'xmllint-wasm'],
    sourcemap: !production,
    minify: production,
    logLevel: 'info',
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
