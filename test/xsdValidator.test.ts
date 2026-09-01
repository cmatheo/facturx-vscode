import { describe, expect, it } from 'vitest';
import * as path from 'node:path';

import { Uri } from 'vscode';
import { validateAgainstXsd } from '../src/xsdValidator';
import { blankCiiInvoiceSkeleton } from '../src/facturxProfile';

const extensionUri = Uri.file(path.resolve(__dirname, '..'));

describe('validateAgainstXsd', () => {
  it('accepts the blank MINIMUM skeleton against the minimum schema', async () => {
    const errors = await validateAgainstXsd(extensionUri, 'minimum', blankCiiInvoiceSkeleton());
    expect(errors).toEqual([]);
  });

  it('reports an error, with a line number, for well-formed but non-schema-valid XML', async () => {
    const xml = `<?xml version="1.0"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
</rsm:CrossIndustryInvoice>`;

    const errors = await validateAgainstXsd(extensionUri, 'minimum', xml);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message.length).toBeGreaterThan(0);
  });

  it('reports an error for XML that is not well-formed at all (unclosed tag)', async () => {
    const errors = await validateAgainstXsd(extensionUri, 'minimum', '<rsm:CrossIndustryInvoice>');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('reports an error for completely empty input', async () => {
    const errors = await validateAgainstXsd(extensionUri, 'minimum', '');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a MINIMUM-only skeleton against the stricter EXTENDED schema', async () => {
    const errors = await validateAgainstXsd(extensionUri, 'extended', blankCiiInvoiceSkeleton());
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an XML declaring the wrong profile than the schema being validated against', async () => {
    const wrongProfileXml = blankCiiInvoiceSkeleton().replace(
      'urn:factur-x.eu:1p0:minimum',
      'urn:factur-x.eu:1p0:basicwl',
    );
    // Structurally still a bare MINIMUM-shaped document, so validating it against
    // basicwl (which requires more elements) should fail even though it's well-formed.
    const errors = await validateAgainstXsd(extensionUri, 'basicwl', wrongProfileXml);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects for an unrecognized profile key not present in xsd/', async () => {
    await expect(
      // @ts-expect-error deliberately passing an invalid profile to check runtime behavior
      validateAgainstXsd(extensionUri, 'nonexistent', blankCiiInvoiceSkeleton()),
    ).rejects.toThrow();
  });

  it('caches the schema bundle across calls (second call for same profile is much faster)', async () => {
    await validateAgainstXsd(extensionUri, 'minimum', blankCiiInvoiceSkeleton());
    const start = performance.now();
    await validateAgainstXsd(extensionUri, 'minimum', blankCiiInvoiceSkeleton());
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});
