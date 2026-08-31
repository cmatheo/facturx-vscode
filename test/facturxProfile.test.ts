import { describe, expect, it } from 'vitest';
import { detectFacturXProfile, facturXProfileLabel, blankCiiInvoiceSkeleton } from '../src/facturxProfile';

function withGuideline(id: string): string {
  return `<?xml version="1.0"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>${id}</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
</rsm:CrossIndustryInvoice>`;
}

describe('detectFacturXProfile', () => {
  it('detects each canonical profile URN exactly', () => {
    expect(detectFacturXProfile(withGuideline('urn:factur-x.eu:1p0:minimum'))).toBe('minimum');
    expect(detectFacturXProfile(withGuideline('urn:factur-x.eu:1p0:basicwl'))).toBe('basicwl');
    expect(
      detectFacturXProfile(withGuideline('urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic')),
    ).toBe('basic');
    expect(detectFacturXProfile(withGuideline('urn:cen.eu:en16931:2017'))).toBe('en16931');
    expect(
      detectFacturXProfile(
        withGuideline('urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended'),
      ),
    ).toBe('extended');
  });

  it('falls back to substring matching for the extended-CTC-FR variant', () => {
    expect(
      detectFacturXProfile(
        withGuideline(
          'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr',
        ),
      ),
    ).toBe('extended');
  });

  it('returns undefined when there is no GuidelineSpecifiedDocumentContextParameter at all', () => {
    expect(detectFacturXProfile('<rsm:CrossIndustryInvoice></rsm:CrossIndustryInvoice>')).toBeUndefined();
  });

  it('returns undefined on completely empty input', () => {
    expect(detectFacturXProfile('')).toBeUndefined();
  });

  it('returns undefined on garbage/non-XML input', () => {
    expect(detectFacturXProfile('not xml at all {}[]<><<<')).toBeUndefined();
  });

  it('returns undefined when the ID element is empty or whitespace-only', () => {
    expect(detectFacturXProfile(withGuideline(''))).toBeUndefined();
    expect(detectFacturXProfile(withGuideline('   '))).toBeUndefined();
  });

  it('returns undefined for an unrecognized guideline URN', () => {
    expect(detectFacturXProfile(withGuideline('urn:something-else:entirely'))).toBeUndefined();
  });

  it('is case-sensitive on the URN (does not fold case)', () => {
    expect(detectFacturXProfile(withGuideline('URN:FACTUR-X.EU:1P0:MINIMUM'))).toBeUndefined();
  });

  it('trims surrounding whitespace/newlines inside the ID element', () => {
    expect(
      detectFacturXProfile(withGuideline('\n      urn:factur-x.eu:1p0:minimum   \n    ')),
    ).toBe('minimum');
  });

  it('does not match when the ID element is unclosed (malformed XML)', () => {
    const malformed = `<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:factur-x.eu:1p0:minimum</ram:GuidelineSpecifiedDocumentContextParameter>`;
    expect(detectFacturXProfile(malformed)).toBeUndefined();
  });

  it('picks the first GuidelineSpecifiedDocumentContextParameter when there are duplicates', () => {
    const xml = `${withGuideline('urn:factur-x.eu:1p0:minimum')}${withGuideline(
      'urn:factur-x.eu:1p0:basicwl',
    )}`;
    expect(detectFacturXProfile(xml)).toBe('minimum');
  });

  it('matches even without a namespace prefix on the elements', () => {
    const xml = `<GuidelineSpecifiedDocumentContextParameter><ID>urn:factur-x.eu:1p0:basicwl</ID></GuidelineSpecifiedDocumentContextParameter>`;
    expect(detectFacturXProfile(xml)).toBe('basicwl');
  });

  it('does not false-positive on a substring appearing outside the ID element', () => {
    const xml = `<!-- urn:factur-x.eu:1p0:minimum mentioned only in a comment -->
      <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:unrelated:value</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>`;
    expect(detectFacturXProfile(xml)).toBeUndefined();
  });
});

describe('facturXProfileLabel', () => {
  it('returns a human label for every profile detectFacturXProfile can produce', () => {
    const profiles = ['minimum', 'basicwl', 'basic', 'en16931', 'extended'] as const;
    for (const profile of profiles) {
      expect(facturXProfileLabel(profile)).toBeTruthy();
    }
  });
});

describe('blankCiiInvoiceSkeleton', () => {
  it('produces XML that itself round-trips through detectFacturXProfile as minimum', () => {
    expect(detectFacturXProfile(blankCiiInvoiceSkeleton())).toBe('minimum');
  });

  it('is well-formed enough that every opened tag is properly closed, in order', () => {
    const xml = blankCiiInvoiceSkeleton().replace(/<\?xml[^?]*\?>/, '');
    const stack: string[] = [];
    const tagPattern = /<(\/?)([a-zA-Z][\w:.-]*)[^>]*?(\/?)>/g;
    let match: RegExpExecArray | null;
    while ((match = tagPattern.exec(xml))) {
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
});
