# Factur-X Viewer

A VS Code extension for opening [Factur-X](https://fnfe-mpe.org/factur-x/) invoices — the Franco-German hybrid e-invoice format that embeds a machine-readable XML (CII / EN 16931) inside a human-readable PDF/A-3.

It displays the PDF and its embedded XML side by side, validates the XML against the official Factur-X schemas, and lets you edit it in place — no CLI, no external service, everything runs inside VS Code.

## Why

Factur-X/ZUGFeRD invoices are opaque to most tools: the PDF looks normal, but the data that matters for automated processing is a compressed XML attachment nobody looks at until an integration breaks. This extension makes that XML visible, editable, and validated where developers and finance-tooling engineers already work.

## Features

- **Open any PDF with the Factur-X editor** — via right-click → _Open with Factur-X Editor_ in the Explorer, or the editor title-bar button (same pattern as the Markdown preview), both shown only for `.pdf` files.
- **Side-by-side view** — the rendered PDF (via `pdf.js`) on one side, the embedded CII XML as a real, editable VS Code text document on the other.
- **Schema validation** — the declared Factur-X profile (MINIMUM, BASIC WL, BASIC, EN 16931 / COMFORT, EXTENDED) is auto-detected from the XML and validated against the matching official XSD, with errors reported live in the **Problems** panel as you type.
- **Editing & round-trip save** — edit the XML directly; saving re-embeds it into the PDF as the `factur-x.xml` attachment (including the `/AF` associated-files entry PDF/A-3 requires), without touching the PDF's visual content.
- **Handles PDFs with no Factur-X XML yet** — opens a schema-valid, blank MINIMUM-profile skeleton to fill in and save as a new attachment, so a plain PDF can be turned into a Factur-X invoice.

## Installation

Releases are published automatically to the VS Code Marketplace (see [Release
process](#release-process) below) — search for "Factur-X Viewer" in the Extensions
view, or install from the command line: `code --install-extension <publisher>.facturx-vscode`.

To run from source instead:

```bash
git clone <this-repo>
cd facturx-vscode
pnpm install
pnpm run compile
```

Then open the folder in VS Code and press `F5` to launch an Extension Development Host, or package it with `pnpm run package` and install the resulting `.vsix` manually.

## Usage

1. Right-click a `.pdf` file in the Explorer and choose **Open with Factur-X Editor** (or open the PDF and click the preview icon in the editor title bar).
2. The PDF renders on the left; the embedded XML opens as an editable document on the right, with its detected profile validated against the corresponding XSD.
3. Validation errors appear inline and in the **Problems** panel as you edit.
4. Save the XML document (`Ctrl+S`/`Cmd+S`) to write it back into the PDF.

## Architecture

- **Extension host** (TypeScript): PDF attachment extraction/writing via [`pdf-lib`](https://github.com/Hopding/pdf-lib), XSD validation via [`xmllint-wasm`](https://github.com/gwicke/xmllint-wasm), diagnostics via `vscode.languages.createDiagnosticCollection`.
- **Webview**: PDF rendering via [`pdf.js`](https://mozilla.github.io/pdf.js/).
- **XML editing**: a virtual `FileSystemProvider` exposes the embedded XML as a real VS Code `TextDocument`, so editing, saving, and diagnostics all use native VS Code UX rather than a custom Monaco widget.
- **Schemas**: the official FNFE-MPE Factur-X 1.09 XSDs are vendored under `xsd/` (see `xsd/NOTICE.md` for provenance and licensing status).

## Development

- `pnpm test` runs the unit test suite (vitest); `pnpm run lint` / `pnpm run format:check` run ESLint/Prettier; `pnpm run compile` type-checks.
- These all run automatically as git hooks on commit (via Husky) and again in CI (GitHub Actions) on every push/PR.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, …) — enforced by a commit-msg hook — since they drive the automated version bump on release.

### Release process

Versioning, changelog, and Marketplace publication are automated via
[release-please](https://github.com/googleapis/release-please): merging its
standing "Release PR" on `main` tags a release and publishes it. See
[`docs/RELEASE_SETUP.md`](./docs/RELEASE_SETUP.md) for how it's wired up and the
one-time manual Azure/Marketplace setup it depends on.

## Roadmap / ideas

- Underline the specific broken element rather than the whole line (needs column info, not just line numbers, from the validator).
- A structured form (dropdowns + typed inputs) per Factur-X profile as an alternative to raw XML editing, to make required fields obvious when upgrading a profile (e.g. MINIMUM → EXTENDED).
- Stronger PDF/A-3 conformance checks after re-embedding (XMP metadata, unencrypted streams).

See `CLAUDE.md` for the full project spec and open design decisions.

## Non-goals (v1)

- No invoice generation from scratch.
- No ERP/accounting integration.
- No CLI/headless mode.

## License

MIT — see [LICENSE](./LICENSE). The vendored Factur-X XSD schemas under `xsd/` are third-party files with their own provenance; see [`xsd/NOTICE.md`](./xsd/NOTICE.md).
