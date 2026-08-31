# Factur-X Viewer — VS Code extension

## Goal

A VS Code extension that opens a Factur-X PDF and displays **side by side**:
- the rendered PDF,
- the embedded CII (Cross Industry Invoice) XML it carries,

with **validation of the XML against the Factur-X schema** (XSD) and the ability to **edit that XML**.

Current scope: usable entirely from within VS Code (no CLI, no separate web service) for now.

## Business context

Factur-X (a Franco-German standard, aligned with EN 16931 / UN/CEFACT CII) is a hybrid e-invoice format: a conformant PDF/A-3 containing, as an embedded attachment, a structured XML file (typically `factur-x.xml`) carrying the machine-readable invoice data. The PDF remains human-readable, while the XML is the authoritative content for automated processing.

Factur-X profiles (from simplest to most complete): MINIMUM, BASIC WL, BASIC, EN 16931 (COMFORT), EXTENDED. Each profile has its own XSD (derived from the CII D16B schema). Validation must identify the profile declared in the XML and apply the matching XSD.

## Intended features

1. **Opening a Factur-X PDF**
   - Extraction of the embedded XML (PDF/A-3 attachment) without a heavy external dependency.
   - Detection of the declared Factur-X profile (`rsm:CrossIndustryInvoice` → `ExchangedDocumentContext` → guideline parameter).

2. **Side-by-side view**
   - Left pane: PDF rendering (pagination, zoom).
   - Right pane: XML editor with syntax highlighting, folding, and where possible XSD-based autocomplete/hints.
   - Minimal useful sync: no requirement for page ↔ XML scroll-sync in v1.

3. **Schema validation**
   - XSD validation of the XML against the schema matching the detected profile.
   - Validation errors surfaced in VS Code's "Problems" panel (diagnostics), with line/column when available.
   - Factur-X XSD schemas bundled with the extension (check FNFE-MPE redistribution licensing before committing them).

4. **XML editing**
   - Free-form editing of the XML text in the right pane.
   - Debounced live revalidation against the XSD.
   - Saving: re-inject the edited XML back into the PDF by replacing the existing attachment (the visual PDF is not regenerated, only the XML attachment changes).
   - Explicit caveat: preserve PDF/A-3 conformance as much as possible (XMP metadata, unencrypted streams) when rewriting; document the limits if strict conformance cannot be guaranteed.

## Proposed technical architecture

- **Extension type**: Custom Editor (webview-based), dedicated `viewType`, activated on `.pdf` files (able to coexist with VS Code's default PDF viewer — the user picks the editor).
- **Extension host (Node/TypeScript)**:
  - Reading the PDF and extracting the embedded attachment → `pdf-lib` (or `pdfjs-dist` for reading attachments) as a starting point.
  - XSD validation → `xmllint-wasm` (xmllint compiled to WebAssembly), run in the extension host, not in the webview.
  - Writing the modified attachment back into the PDF → `pdf-lib`.
- **Webview**:
  - PDF rendering via `pdf.js`.
  - XML editing via a bundled Monaco instance, or delegated to a standard VS Code `TextDocument` opened side by side (to be decided — affects save UX and diagnostics integration).
- **Diagnostics**: `vscode.languages.createDiagnosticCollection` to surface XSD errors as standard VS Code diagnostics.

## Open decisions (to settle as development proceeds)

- XML editor: Monaco widget inside the webview vs. a native VS Code document opened alongside (affects save simplicity and diagnostics integration).
- Strategy for regenerating PDF/A-3 conformance after editing.
- Handling PDFs with no embedded XML (fallback behavior: fall back to the standard PDF view, or show an empty panel with an "attach an XML" action).
- Packaging of the Factur-X XSDs (licensing, versioning of profiles/vintages CII D16B/D22B).

## Internationalization

The project targets an international audience from day one:
- All source code, identifiers, comments, commit messages, and UI strings are in English.
- User-facing strings go through VS Code's `l10n` API (`vscode.l10n.t(...)`) from the start, even before any translation is added, so localization can be layered on without refactoring.
- No hardcoded locale-specific formatting (dates, numbers, currency) — use `Intl` APIs and respect the user's VS Code display language where relevant.
- Documentation (README, CLAUDE.md, CHANGELOG) is written in English; translations, if any, are added as separate files (e.g. `README.fr.md`), never by mixing languages in the same file.
- XSD/business terminology (Factur-X, CII, EN 16931 profile names) is kept in its official English/international form rather than translated.

## Stack

- TypeScript, standard VS Code extension API.
- Packaging: `vsce` to produce a `.vsix` (for local use in VS Code for now, no Marketplace publication planned at this stage).

## Non-goals (v1)

- No Factur-X invoice generation from scratch.
- No ERP/accounting system integration.
- No CLI/headless mode.
