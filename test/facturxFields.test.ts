import { describe, expect, it } from 'vitest';
import {
  FIELD_DEFS,
  LINE_ITEM_FIELD_DEFS,
  buildCiiInvoiceXml,
  extractFieldValues,
  extractLineItems,
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
  values.paymentDueDate = '20260201';
  return values;
}

function fullLineItem(): Record<string, string> {
  const line: Record<string, string> = {};
  for (const field of LINE_ITEM_FIELD_DEFS) {
    line[field.id] = field.default ?? `TEST-${field.id}`;
  }
  line.lineId = '1';
  line.unitPrice = '10.00';
  line.quantity = '2';
  line.lineTotal = '20.00';
  return line;
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

  it('produces XSD-valid XML for basicwl (address details, VAT breakdown, payment means/terms) with all mandatory fields filled', async () => {
    const xml = buildCiiInvoiceXml('basicwl', fullValues());
    const errors = await validateAgainstXsd(extensionUri, 'basicwl', xml);
    expect(errors).toEqual([]);
  });

  it.each(['basic', 'en16931', 'extended'] as const)(
    'produces XSD-valid XML for %s with a filled-in line item',
    async (profile) => {
      const xml = buildCiiInvoiceXml(profile, fullValues(), [fullLineItem()]);
      const errors = await validateAgainstXsd(extensionUri, profile, xml);
      expect(errors).toEqual([]);
    },
  );

  it.each(['basic', 'en16931', 'extended'] as const)(
    'fails XSD validation for %s when no line item is given, since at least one is required',
    async (profile) => {
      const xml = buildCiiInvoiceXml(profile, fullValues(), []);
      const errors = await validateAgainstXsd(extensionUri, profile, xml);
      expect(errors.length).toBeGreaterThan(0);
    },
  );

  it('omits a line item that is entirely blank rather than emitting an empty element', () => {
    const xml = buildCiiInvoiceXml('basic', fullValues(), [{}, fullLineItem(), {}]);
    expect(xml.match(/<ram:IncludedSupplyChainTradeLineItem>/g)?.length).toBe(1);
  });

  it('does not emit IncludedSupplyChainTradeLineItem at all for basicwl even if line items are passed in, since basicwl schema omits the element', async () => {
    const xml = buildCiiInvoiceXml('basicwl', fullValues(), [fullLineItem()]);
    expect(xml).not.toContain('IncludedSupplyChainTradeLineItem');
    const errors = await validateAgainstXsd(extensionUri, 'basicwl', xml);
    expect(errors).toEqual([]);
  });

  it('places the header LineTotalAmount before TaxBasisTotalAmount in the monetary summation', () => {
    const xml = buildCiiInvoiceXml('basicwl', fullValues());
    const lineTotalIndex = xml.indexOf('<ram:LineTotalAmount>');
    const taxBasisIndex = xml.indexOf('<ram:TaxBasisTotalAmount>');
    expect(lineTotalIndex).toBeGreaterThan(-1);
    expect(lineTotalIndex).toBeLessThan(taxBasisIndex);
  });

  it('places PostcodeCode before LineOne in a postal address', () => {
    const xml = buildCiiInvoiceXml('basicwl', fullValues());
    const postcodeIndex = xml.indexOf('<ram:PostcodeCode>');
    const lineOneIndex = xml.indexOf('<ram:LineOne>');
    expect(postcodeIndex).toBeGreaterThan(-1);
    expect(postcodeIndex).toBeLessThan(lineOneIndex);
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

describe('extractLineItems', () => {
  it('recovers a single line item generated by buildCiiInvoiceXml', () => {
    const line = fullLineItem();
    const xml = buildCiiInvoiceXml('basic', fullValues(), [line]);
    const extracted = extractLineItems(xml);
    expect(extracted).toHaveLength(1);
    for (const field of LINE_ITEM_FIELD_DEFS) {
      expect(extracted[0][field.id]).toBe(line[field.id]);
    }
  });

  it('recovers multiple line items in document order', () => {
    const first = { ...fullLineItem(), lineId: '1', productName: 'First' };
    const second = { ...fullLineItem(), lineId: '2', productName: 'Second' };
    const xml = buildCiiInvoiceXml('basic', fullValues(), [first, second]);
    const extracted = extractLineItems(xml);
    expect(extracted).toHaveLength(2);
    expect(extracted[0].productName).toBe('First');
    expect(extracted[1].productName).toBe('Second');
  });

  it('returns an empty array for XML with no line items', () => {
    expect(extractLineItems(buildCiiInvoiceXml('minimum', fullValues()))).toEqual([]);
  });

  it('returns an empty array for completely empty input', () => {
    expect(extractLineItems('')).toEqual([]);
  });

  it('does not throw on malformed/unclosed line item markup', () => {
    expect(() =>
      extractLineItems('<ram:IncludedSupplyChainTradeLineItem><ram:Name>unclosed'),
    ).not.toThrow();
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
