export type FacturXProfile = 'minimum' | 'basicwl' | 'basic' | 'en16931' | 'extended';

/**
 * Guideline URNs used in ExchangedDocumentContext/GuidelineSpecifiedDocumentContextParameter/ID,
 * as documented by FNFE-MPE for Factur-X 1.09. Extended-CTC-FR variants also resolve to 'extended'
 * since they share the same base schema.
 */
const PROFILE_URNS: Array<{ profile: FacturXProfile; urn: string }> = [
  { profile: 'minimum', urn: 'urn:factur-x.eu:1p0:minimum' },
  { profile: 'basicwl', urn: 'urn:factur-x.eu:1p0:basicwl' },
  { profile: 'basic', urn: 'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic' },
  { profile: 'extended', urn: 'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended' },
  { profile: 'en16931', urn: 'urn:cen.eu:en16931:2017' },
];

const GUIDELINE_ID_PATTERN =
  /<(?:ram:)?GuidelineSpecifiedDocumentContextParameter>\s*<(?:ram:)?ID>([^<]+)<\/(?:ram:)?ID>/;

/**
 * Detects the declared Factur-X profile from the raw XML text via a regex on the
 * GuidelineSpecifiedDocumentContextParameter/ID element, avoiding a full XML parse
 * for this lightweight lookup. Falls back to prefix/substring matching since the
 * extended-CTC-FR variant's URN doesn't exactly match the base 'extended' URN.
 */
export function detectFacturXProfile(xml: string): FacturXProfile | undefined {
  const match = GUIDELINE_ID_PATTERN.exec(xml);
  const guidelineId = match?.[1]?.trim();
  if (!guidelineId) {
    return undefined;
  }

  const exact = PROFILE_URNS.find(({ urn }) => guidelineId === urn);
  if (exact) {
    return exact.profile;
  }

  if (guidelineId.includes(':extended')) {
    return 'extended';
  }
  if (guidelineId.includes(':basicwl')) {
    return 'basicwl';
  }
  if (guidelineId.includes(':basic')) {
    return 'basic';
  }
  if (guidelineId.includes(':minimum')) {
    return 'minimum';
  }
  if (guidelineId.startsWith('urn:cen.eu:en16931:2017')) {
    return 'en16931';
  }
  return undefined;
}

const PROFILE_LABELS: Record<FacturXProfile, string> = {
  minimum: 'MINIMUM',
  basicwl: 'BASIC WL',
  basic: 'BASIC',
  en16931: 'EN 16931 (COMFORT)',
  extended: 'EXTENDED',
};

export function facturXProfileLabel(profile: FacturXProfile): string {
  return PROFILE_LABELS[profile];
}

/**
 * A structurally valid (schema-passing) but content-empty MINIMUM-profile CII invoice,
 * used as the starting point when a PDF carries no embedded Factur-X XML yet. MINIMUM is
 * the smallest profile, so it's the least presumptuous default to hand the user to fill in
 * or upgrade to a richer profile.
 */
export function blankCiiInvoiceSkeleton(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>INVOICE-NUMBER</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">20260101</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>SELLER NAME</ram:Name>
        <ram:PostalTradeAddress>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">FRXX999999999</ram:ID>
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>BUYER NAME</ram:Name>
        <ram:PostalTradeAddress>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:TaxBasisTotalAmount>0.00</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>0.00</ram:GrandTotalAmount>
        <ram:DuePayableAmount>0.00</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}
