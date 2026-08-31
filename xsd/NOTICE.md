# Factur-X XSD schemas — provenance

The `.xsd` files under this directory are the official Factur-X 1.09 validation
schemas published by FNFE-MPE / FeRD (the Forum National de la Facture
Electronique and its German counterpart), for the CII-based EN 16931 profiles:
MINIMUM, BASIC WL, BASIC, EN16931 (COMFORT), EXTENDED.

They were vendored from the `src/facturx/xsd_and_schematron/` directory of
[akretion/factur-x](https://github.com/akretion/factur-x) (commit tree as of
2026-08-31), which redistributes the schemas as published by FNFE-MPE for free
public download at https://fnfe-mpe.org/factur-x/. Only the `.xsd` files are
included here (the `.xsl` stylesheets and `codedb.xml` reference files from the
upstream distribution are not needed for XSD validation and were omitted).

The schemas themselves are authored by FNFE-MPE/FeRD, not by akretion; akretion's
BSD-style license covers their own Python tooling, not the schema content. If
stricter licensing clarity is required before any wider distribution of this
extension (e.g. Marketplace publication), reach out to FNFE-MPE directly.
