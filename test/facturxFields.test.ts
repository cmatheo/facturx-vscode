import { describe, expect, it } from 'vitest';
import {
  FIELD_DEFS,
  buildCiiInvoiceXml,
  extractFieldValues,
  isFieldMandatory,
} from '../src/facturxFields';
import { detectFacturXProfile } from '../src/facturxProfile';
import { validateAgainstXsd } from '../src/xsdValidator';
import * as path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { Uri } from 'vscode';

const extensionUri = Uri.file(path.resolve(__dirname, '..'));

function fullValues(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of FIELD_DEFS) {
    values[field.id] = field.default ?? `TEST-${field.id}`;
  }
  values.issueDate = '20260101';
  return values;
}

describe('buildCiiInvoiceXml', () => {
  it('round-trips the declared profile through detectFacturXProfile', () => {
    for (const profile of ['minimum', 'basicwl', 'basic', 'en16931', 'extended'] as const) {
      const xml = buildCiiInvoiceXml(profile, fullValues());
      expect(detectFacturXProfile(xml)).toBe(profile);
    }
  });

  it('produces XML that passes XSD validation for the minimum profile when all mandatory fields are filled', async () => {
    const xml = buildCiiInvoiceXml('minimum', fullValues());
    const errors = await validateAgainstXsd(extensionUri, 'minimum', xml);
    expect(errors).toEqual([]);
  });

  it('produces well-formed XML with every tag closed, in order', () => {
    const xml = buildCiiInvoiceXml('extended', fullValues());
    const stack: string[] = [];
    const tagPattern = /<(\/?)([a-zA-Z][\w:.-]*)[^>]*?(\/?)>/g;
    let match: RegExpExecArray | null;
    while ((match = tagPattern.exec(xml.replace(/<\?xml[^?]*\?>/, '')))) {
      const [, isClosing, name, isSelfClosing] = match;
      if (isSelfClosing) {
        continue;
      }
      if (isClosing) {
        expect(stack.pop()).toBe(name);
      } else {
        stack.push(name);
      }
    }
    expect(stack).toEqual([]);
  });

  it('omits an optional field entirely when left blank, rather than emitting an empty tag', () => {
    const values = fullValues();
    delete values.buyerReference;
    const xml = buildCiiInvoiceXml('minimum', values);
    expect(xml).not.toContain('BuyerReference');
  });

  it('omits an unfilled mandatory field on purpose, producing schema-invalid XML by omission', async () => {
    const values = fullValues();
    delete values.sellerName;
    const xml = buildCiiInvoiceXml('minimum', values);
    expect(xml).not.toContain('SELLER NAME');

    const errors = await validateAgainstXsd(extensionUri, 'minimum', xml);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('does not render an empty self-closing tag for an unfilled leaf field', () => {
    const values = fullValues();
    delete values.note;
    const xml = buildCiiInvoiceXml('minimum', values);
    expect(xml).not.toMatch(/<ram:IncludedNote/);
  });

  it('still renders the structural ApplicableHeaderTradeDelivery element even though it is always empty', () => {
    const xml = buildCiiInvoiceXml('minimum', fullValues());
    expect(xml).toContain('<ram:ApplicableHeaderTradeDelivery/>');
  });

  it('handles a completely empty values object without throwing, producing a minimal invalid skeleton', () => {
    expect(() => buildCiiInvoiceXml('minimum', {})).not.toThrow();
    const xml = buildCiiInvoiceXml('minimum', {});
    expect(xml).toContain('CrossIndustryInvoice');
    expect(xml).not.toContain('SellerTradeParty');
  });

  it('escapes XML special characters in field values', () => {
    const values = fullValues();
    values.sellerName = 'Seller & <Co> "Ltd"';
    const xml = buildCiiInvoiceXml('minimum', values);
    expect(xml).toContain('Seller &amp; &lt;Co&gt; &quot;Ltd&quot;');
    expect(xml).not.toContain('<Co>');
  });

  it('places BuyerReference before SellerTradeParty regardless of field iteration order', () => {
    const xml = buildCiiInvoiceXml('basicwl', fullValues());
    const refIndex = xml.indexOf('BuyerReference');
    const sellerIndex = xml.indexOf('SellerTradeParty');
    expect(refIndex).toBeGreaterThan(-1);
    expect(refIndex).toBeLessThan(sellerIndex);
  });

  it('attaches currencyID to TaxTotalAmount matching the invoice currency', () => {
    const values = fullValues();
    values.currencyCode = 'USD';
    const xml = buildCiiInvoiceXml('minimum', values);
    expect(xml).toMatch(/<ram:TaxTotalAmount currencyID="USD">/);
  });

  it('excludes basicwl-and-up-only fields from a minimum-profile document even when filled in, since MINIMUM schema rejects them outright', async () => {
    const xml = buildCiiInvoiceXml('minimum', fullValues());
    expect(xml).not.toContain('BuyerReference');
    expect(xml).not.toContain('IncludedNote');
    expect(xml).not.toContain('LineOne');
    expect(xml).not.toContain('PostcodeCode');

    const errors = await validateAgainstXsd(extensionUri, 'minimum', xml);
    expect(errors).toEqual([]);
  });

  it('ignores whitespace-only values as if they were absent', () => {
    const values = fullValues();
    values.buyerReference = '   ';
    const xml = buildCiiInvoiceXml('minimum', values);
    expect(xml).not.toContain('BuyerReference');
  });
});

describe('extractFieldValues', () => {
  it('recovers every field value from XML it generated itself', () => {
    const values = fullValues();
    const xml = buildCiiInvoiceXml('extended', values);
    const extracted = extractFieldValues(xml);
    for (const field of FIELD_DEFS) {
      expect(extracted[field.id]).toBe(values[field.id]);
    }
  });

  it('does not confuse SellerTradeParty/Name with BuyerTradeParty/Name', () => {
    const values = fullValues();
    values.sellerName = 'ONLY SELLER';
    values.buyerName = 'ONLY BUYER';
    const xml = buildCiiInvoiceXml('minimum', values);
    const extracted = extractFieldValues(xml);
    expect(extracted.sellerName).toBe('ONLY SELLER');
    expect(extracted.buyerName).toBe('ONLY BUYER');
  });

  it('returns no value for fields absent from the XML rather than throwing', () => {
    const xml = '<rsm:CrossIndustryInvoice></rsm:CrossIndustryInvoice>';
    const extracted = extractFieldValues(xml);
    expect(extracted.sellerName).toBeUndefined();
    expect(Object.keys(extracted)).toEqual([]);
  });

  it('does not throw on malformed/unclosed XML', () => {
    expect(() => extractFieldValues('<rsm:CrossIndustryInvoice><ram:Name>unclosed')).not.toThrow();
  });

  it('does not throw on completely empty input', () => {
    expect(extractFieldValues('')).toEqual({});
  });
});

describe('isFieldMandatory', () => {
  it('treats seller name as mandatory for every profile', () => {
    const field = FIELD_DEFS.find((f) => f.id === 'sellerName')!;
    for (const profile of ['minimum', 'basicwl', 'basic', 'en16931', 'extended'] as const) {
      expect(isFieldMandatory(field, profile)).toBe(true);
    }
  });

  it('treats seller street as optional for minimum but mandatory from basicwl onward', () => {
    const field = FIELD_DEFS.find((f) => f.id === 'sellerStreet')!;
    expect(isFieldMandatory(field, 'minimum')).toBe(false);
    expect(isFieldMandatory(field, 'basicwl')).toBe(true);
    expect(isFieldMandatory(field, 'extended')).toBe(true);
  });

  it('treats note as optional for every profile', () => {
    const field = FIELD_DEFS.find((f) => f.id === 'note')!;
    for (const profile of ['minimum', 'basicwl', 'basic', 'en16931', 'extended'] as const) {
      expect(isFieldMandatory(field, profile)).toBe(false);
    }
  });
});
