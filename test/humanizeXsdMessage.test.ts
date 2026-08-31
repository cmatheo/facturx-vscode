import { describe, expect, it } from 'vitest';
import { humanizeXsdMessage } from '../src/xsdValidator';

const NS = '{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}';

describe('humanizeXsdMessage', () => {
  it('rewrites an out-of-order/extra element error with the expected-elements list', () => {
    const raw = `Element '${NS}SpecifiedTradeSettlementHeaderMonetarySummation': This element is not expected. Expected is one of ( ${NS}InvoiceIssuerReference, ${NS}InvoicerTradeParty, ${NS}ApplicableTradeTax ).`;
    const message = humanizeXsdMessage(raw);
    expect(message).not.toContain('{urn:');
    expect(message).toContain('<SpecifiedTradeSettlementHeaderMonetarySummation>');
    expect(message).toContain('InvoiceIssuerReference, InvoicerTradeParty, ApplicableTradeTax');
    expect(message.toLowerCase()).toContain('out of order');
  });

  it('handles the singular "Expected is (X)" phrasing (no "one of")', () => {
    const raw = `Element '${NS}Foo': This element is not expected. Expected is ( ${NS}Bar ).`;
    const message = humanizeXsdMessage(raw);
    expect(message).toContain('<Foo>');
    expect(message).toContain('Bar');
  });

  it('handles "not expected" with no expected-elements list at all', () => {
    const raw = `Element '${NS}Foo': This element is not expected.`;
    const message = humanizeXsdMessage(raw);
    expect(message).toContain('<Foo>');
    expect(message).not.toContain('{urn:');
  });

  it('rewrites a missing-mandatory-child error', () => {
    const raw = `Element '${NS}ApplicableHeaderTradeSettlement': Missing child element(s). Expected is ( ${NS}ApplicableTradeTax ).`;
    const message = humanizeXsdMessage(raw);
    expect(message).toContain('<ApplicableHeaderTradeSettlement>');
    expect(message).toContain('missing a required child element');
    expect(message).toContain('ApplicableTradeTax');
  });

  it('rewrites a wrong-root-element error', () => {
    const raw = `Element '${NS}CrossIndustryInvoice': No matching global declaration available for the validation root.`;
    const message = humanizeXsdMessage(raw);
    expect(message).toContain('<CrossIndustryInvoice>');
    expect(message.toLowerCase()).toContain('profile');
  });

  it('falls back to stripping namespaces for unrecognized message shapes', () => {
    const raw = `Element '${NS}Foo': 'bar' is not a valid value of the atomic type 'xs:decimal'.`;
    const message = humanizeXsdMessage(raw);
    expect(message).not.toContain('{urn:');
    expect(message).toContain("Element 'Foo'");
  });
});
