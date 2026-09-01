import { FacturXProfile } from './facturxProfile';

export type FieldType = 'text' | 'date' | 'number';

/**
 * One editable CII field exposed in the form view. `xmlPath` is the chain of element
 * names from the document root down to the leaf holding the value (used both to
 * generate XML and to narrow down to the right element when reading it back out of
 * existing XML, since e.g. "Name" and "CountryID" each appear under both the seller
 * and the buyer party).
 *
 * This is a deliberately small, practical subset of the full CII/Factur-X model, not
 * a complete implementation of every XSD-defined field. `mandatoryFor` reflects a
 * best-effort reading of which profile first requires the field, not a certified
 * mapping — the XSD validation diagnostics remain the authoritative check.
 */
export interface FieldDef {
  id: string;
  group: string;
  label: string;
  description: string;
  type: FieldType;
  xmlPath: string[];
  attribute?: { name: string; value: string };
  mandatoryFor: FacturXProfile[];
  /**
   * The least rich profile this field's element is valid to appear at all under
   * (MINIMUM's schema is closed: it rejects optional elements like notes or address
   * detail lines outright, not just "doesn't require" them). Defaults to 'minimum'
   * (always available) when omitted.
   */
  availableFrom?: FacturXProfile;
  default?: string;
}

const ALL_PROFILES: FacturXProfile[] = ['minimum', 'basicwl', 'basic', 'en16931', 'extended'];
const FROM_BASICWL: FacturXProfile[] = ['basicwl', 'basic', 'en16931', 'extended'];

export function isFieldAvailable(field: FieldDef, profile: FacturXProfile): boolean {
  const from = field.availableFrom ?? 'minimum';
  return ALL_PROFILES.indexOf(profile) >= ALL_PROFILES.indexOf(from);
}

export const FIELD_DEFS: FieldDef[] = [
  {
    id: 'invoiceNumber',
    group: 'Invoice',
    label: 'Invoice number',
    description: 'Unique identifier of this invoice (ExchangedDocument/ID).',
    type: 'text',
    xmlPath: ['rsm:ExchangedDocument', 'ram:ID'],
    mandatoryFor: ALL_PROFILES,
    default: 'INVOICE-NUMBER',
  },
  {
    id: 'invoiceTypeCode',
    group: 'Invoice',
    label: 'Document type code',
    description: 'UNTDID 1001 code for the document type. 380 = commercial invoice.',
    type: 'text',
    xmlPath: ['rsm:ExchangedDocument', 'ram:TypeCode'],
    mandatoryFor: ALL_PROFILES,
    default: '380',
  },
  {
    id: 'issueDate',
    group: 'Invoice',
    label: 'Issue date',
    description: 'Date the invoice was issued (YYYYMMDD, format code 102).',
    type: 'date',
    xmlPath: ['rsm:ExchangedDocument', 'ram:IssueDateTime', 'udt:DateTimeString'],
    attribute: { name: 'format', value: '102' },
    mandatoryFor: ALL_PROFILES,
  },
  {
    id: 'note',
    group: 'Invoice',
    label: 'Note',
    description: 'Free-text note attached to the invoice (e.g. payment instructions).',
    type: 'text',
    xmlPath: ['rsm:ExchangedDocument', 'ram:IncludedNote', 'ram:Content'],
    mandatoryFor: [],
    availableFrom: 'basicwl',
  },
  {
    id: 'sellerName',
    group: 'Seller',
    label: 'Name',
    description: "Seller's registered name.",
    type: 'text',
    xmlPath: ['ram:SellerTradeParty', 'ram:Name'],
    mandatoryFor: ALL_PROFILES,
    default: 'SELLER NAME',
  },
  {
    // Must stay ordered before sellerStreet: TradeAddressType's schema sequence is
    // PostcodeCode, LineOne, LineTwo, LineThree, CityName, CountryID.
    id: 'sellerPostcode',
    group: 'Seller',
    label: 'Postcode',
    description: 'Seller postal address, postcode.',
    type: 'text',
    xmlPath: ['ram:SellerTradeParty', 'ram:PostalTradeAddress', 'ram:PostcodeCode'],
    mandatoryFor: FROM_BASICWL,
    availableFrom: 'basicwl',
  },
  {
    id: 'sellerStreet',
    group: 'Seller',
    label: 'Street',
    description: 'Seller postal address, first address line.',
    type: 'text',
    xmlPath: ['ram:SellerTradeParty', 'ram:PostalTradeAddress', 'ram:LineOne'],
    mandatoryFor: FROM_BASICWL,
    availableFrom: 'basicwl',
  },
  {
    id: 'sellerCity',
    group: 'Seller',
    label: 'City',
    description: 'Seller postal address, city.',
    type: 'text',
    xmlPath: ['ram:SellerTradeParty', 'ram:PostalTradeAddress', 'ram:CityName'],
    mandatoryFor: FROM_BASICWL,
    availableFrom: 'basicwl',
  },
  {
    id: 'sellerCountry',
    group: 'Seller',
    label: 'Country',
    description: 'Seller country, ISO 3166-1 alpha-2 code (e.g. FR).',
    type: 'text',
    xmlPath: ['ram:SellerTradeParty', 'ram:PostalTradeAddress', 'ram:CountryID'],
    mandatoryFor: ALL_PROFILES,
    default: 'FR',
  },
  {
    id: 'sellerVatId',
    group: 'Seller',
    label: 'VAT number',
    description: 'Seller VAT identifier (SpecifiedTaxRegistration/ID, schemeID=VA).',
    type: 'text',
    xmlPath: ['ram:SellerTradeParty', 'ram:SpecifiedTaxRegistration', 'ram:ID'],
    attribute: { name: 'schemeID', value: 'VA' },
    mandatoryFor: ALL_PROFILES,
    default: 'FRXX999999999',
  },
  {
    id: 'buyerReference',
    group: 'Buyer',
    label: 'Buyer reference',
    description: 'Reference used by the buyer for internal routing of the invoice.',
    type: 'text',
    xmlPath: ['ram:ApplicableHeaderTradeAgreement', 'ram:BuyerReference'],
    mandatoryFor: [],
    availableFrom: 'basicwl',
  },
  {
    id: 'buyerName',
    group: 'Buyer',
    label: 'Name',
    description: "Buyer's registered name.",
    type: 'text',
    xmlPath: ['ram:BuyerTradeParty', 'ram:Name'],
    mandatoryFor: ALL_PROFILES,
    default: 'BUYER NAME',
  },
  {
    // Must stay ordered before buyerStreet: TradeAddressType's schema sequence is
    // PostcodeCode, LineOne, LineTwo, LineThree, CityName, CountryID.
    id: 'buyerPostcode',
    group: 'Buyer',
    label: 'Postcode',
    description: 'Buyer postal address, postcode.',
    type: 'text',
    xmlPath: ['ram:BuyerTradeParty', 'ram:PostalTradeAddress', 'ram:PostcodeCode'],
    mandatoryFor: FROM_BASICWL,
    availableFrom: 'basicwl',
  },
  {
    id: 'buyerStreet',
    group: 'Buyer',
    label: 'Street',
    description: 'Buyer postal address, first address line.',
    type: 'text',
    xmlPath: ['ram:BuyerTradeParty', 'ram:PostalTradeAddress', 'ram:LineOne'],
    mandatoryFor: FROM_BASICWL,
    availableFrom: 'basicwl',
  },
  {
    id: 'buyerCity',
    group: 'Buyer',
    label: 'City',
    description: 'Buyer postal address, city.',
    type: 'text',
    xmlPath: ['ram:BuyerTradeParty', 'ram:PostalTradeAddress', 'ram:CityName'],
    mandatoryFor: FROM_BASICWL,
    availableFrom: 'basicwl',
  },
  {
    id: 'buyerCountry',
    group: 'Buyer',
    label: 'Country',
    description: 'Buyer country, ISO 3166-1 alpha-2 code (e.g. FR).',
    type: 'text',
    xmlPath: ['ram:BuyerTradeParty', 'ram:PostalTradeAddress', 'ram:CountryID'],
    mandatoryFor: ALL_PROFILES,
    default: 'FR',
  },
  {
    id: 'currencyCode',
    group: 'Payment & totals',
    label: 'Currency',
    description: 'ISO 4217 currency code for the invoice (e.g. EUR).',
    type: 'text',
    xmlPath: ['ram:ApplicableHeaderTradeSettlement', 'ram:InvoiceCurrencyCode'],
    mandatoryFor: ALL_PROFILES,
    default: 'EUR',
  },
  // The next fields (payment means, VAT breakdown, payment terms) must stay in this
  // exact relative order: HeaderTradeSettlementType's schema sequence is
  // InvoiceCurrencyCode, SpecifiedTradeSettlementPaymentMeans, ApplicableTradeTax,
  // SpecifiedTradePaymentTerms, SpecifiedTradeSettlementHeaderMonetarySummation -
  // and buildCiiInvoiceXml() creates each element the first time a field targeting
  // it is processed, so FIELD_DEFS order drives output order for siblings.
  {
    id: 'paymentMeansTypeCode',
    group: 'Payment & totals',
    label: 'Payment means code',
    description: 'UNTDID 4461 payment means code (e.g. 58 = SEPA credit transfer, 59 = SEPA direct debit).',
    type: 'text',
    xmlPath: [
      'ram:ApplicableHeaderTradeSettlement',
      'ram:SpecifiedTradeSettlementPaymentMeans',
      'ram:TypeCode',
    ],
    mandatoryFor: [],
    availableFrom: 'basicwl',
    default: '58',
  },
  {
    id: 'paymentMeansIban',
    group: 'Payment & totals',
    label: 'Payee IBAN',
    description: 'IBAN of the account the invoice should be paid into.',
    type: 'text',
    xmlPath: [
      'ram:ApplicableHeaderTradeSettlement',
      'ram:SpecifiedTradeSettlementPaymentMeans',
      'ram:PayeePartyCreditorFinancialAccount',
      'ram:IBANID',
    ],
    mandatoryFor: [],
    availableFrom: 'basicwl',
  },
  // VAT breakdown (ApplicableTradeTax) is a repeatable header structure - see
  // VAT_BREAKDOWN_FIELD_DEFS/buildVatBreakdownNode below, not FIELD_DEFS, since a
  // single-value FieldDef can't represent "zero or more" entries.
  {
    id: 'paymentDueDate',
    group: 'Payment & totals',
    label: 'Payment due date',
    description: 'Date by which the invoice must be paid.',
    type: 'date',
    xmlPath: [
      'ram:ApplicableHeaderTradeSettlement',
      'ram:SpecifiedTradePaymentTerms',
      'ram:DueDateDateTime',
      'udt:DateTimeString',
    ],
    attribute: { name: 'format', value: '102' },
    mandatoryFor: [],
    availableFrom: 'basicwl',
  },
  {
    // SpecifiedTradeSettlementHeaderMonetarySummationType only defines LineTotalAmount
    // from basicwl onward (MINIMUM's summation type omits it entirely) - and where it
    // exists it must be the first child, before TaxBasisTotalAmount.
    id: 'lineTotalSum',
    group: 'Payment & totals',
    label: 'Line total sum',
    description:
      'Sum of all invoice line net totals, excluding tax (should match the tax basis total when there are no allowances/charges).',
    type: 'number',
    xmlPath: [
      'ram:ApplicableHeaderTradeSettlement',
      'ram:SpecifiedTradeSettlementHeaderMonetarySummation',
      'ram:LineTotalAmount',
    ],
    mandatoryFor: FROM_BASICWL,
    availableFrom: 'basicwl',
    default: '0.00',
  },
  {
    id: 'taxBasisTotal',
    group: 'Payment & totals',
    label: 'Tax basis total',
    description: 'Sum of the invoice line net amounts, excluding tax.',
    type: 'number',
    xmlPath: [
      'ram:ApplicableHeaderTradeSettlement',
      'ram:SpecifiedTradeSettlementHeaderMonetarySummation',
      'ram:TaxBasisTotalAmount',
    ],
    mandatoryFor: ALL_PROFILES,
    default: '0.00',
  },
  {
    id: 'taxTotal',
    group: 'Payment & totals',
    label: 'Tax total',
    description: 'Total tax amount for the invoice.',
    type: 'number',
    xmlPath: [
      'ram:ApplicableHeaderTradeSettlement',
      'ram:SpecifiedTradeSettlementHeaderMonetarySummation',
      'ram:TaxTotalAmount',
    ],
    mandatoryFor: ALL_PROFILES,
    default: '0.00',
  },
  {
    id: 'grandTotal',
    group: 'Payment & totals',
    label: 'Grand total',
    description: 'Total invoice amount including tax.',
    type: 'number',
    xmlPath: [
      'ram:ApplicableHeaderTradeSettlement',
      'ram:SpecifiedTradeSettlementHeaderMonetarySummation',
      'ram:GrandTotalAmount',
    ],
    mandatoryFor: ALL_PROFILES,
    default: '0.00',
  },
  {
    id: 'duePayable',
    group: 'Payment & totals',
    label: 'Due payable',
    description: 'Outstanding amount to be paid.',
    type: 'number',
    xmlPath: [
      'ram:ApplicableHeaderTradeSettlement',
      'ram:SpecifiedTradeSettlementHeaderMonetarySummation',
      'ram:DuePayableAmount',
    ],
    mandatoryFor: ALL_PROFILES,
    default: '0.00',
  },
];

export function isFieldMandatory(field: FieldDef, profile: FacturXProfile): boolean {
  return field.mandatoryFor.includes(profile);
}

/** The least rich profile whose schema even defines IncludedSupplyChainTradeLineItem (BASICWL omits it entirely - it's the "without lines" profile). */
export const LINE_ITEMS_AVAILABLE_FROM: FacturXProfile = 'basic';

export function areLineItemsAvailable(profile: FacturXProfile): boolean {
  return ALL_PROFILES.indexOf(profile) >= ALL_PROFILES.indexOf(LINE_ITEMS_AVAILABLE_FROM);
}

/** The least rich profile whose schema requires a VAT breakdown (ApplicableTradeTax) at header level. */
export const VAT_BREAKDOWN_AVAILABLE_FROM: FacturXProfile = 'basicwl';

export function isVatBreakdownAvailable(profile: FacturXProfile): boolean {
  return ALL_PROFILES.indexOf(profile) >= ALL_PROFILES.indexOf(VAT_BREAKDOWN_AVAILABLE_FROM);
}

/**
 * One column of a VAT breakdown row. Kept separate from FieldDef/FIELD_DEFS since,
 * like line items, a header can carry zero or more of these (one per distinct VAT
 * category/rate on the invoice) rather than a single document-wide value. `xmlLeaf`
 * is relative to one <ram:ApplicableTradeTax> element under
 * ApplicableHeaderTradeSettlement.
 */
export interface VatBreakdownFieldDef {
  id: string;
  label: string;
  description: string;
  type: FieldType;
  xmlLeaf: string[];
  default?: string;
}

// Order matches TradeTaxType's schema sequence: CalculatedAmount, TypeCode,
// ExemptionReason, BasisAmount, CategoryCode, ExemptionReasonCode, DueDateTypeCode,
// RateApplicablePercent (the unused optional exemption/due-date fields are skipped).
export const VAT_BREAKDOWN_FIELD_DEFS: VatBreakdownFieldDef[] = [
  {
    id: 'vatCalculatedAmount',
    label: 'VAT amount',
    description: 'Tax amount for this VAT category/rate.',
    type: 'number',
    xmlLeaf: ['ram:CalculatedAmount'],
    default: '0.00',
  },
  {
    id: 'vatTypeCode',
    label: 'Tax type code',
    description: 'UNTDID 5153 tax type code. VAT for standard European value-added tax.',
    type: 'text',
    xmlLeaf: ['ram:TypeCode'],
    default: 'VAT',
  },
  {
    id: 'vatBasisAmount',
    label: 'VAT basis amount',
    description:
      'Amount this VAT rate applies to (the sum of the tax basis amounts across breakdown rows should match the invoice tax basis total).',
    type: 'number',
    xmlLeaf: ['ram:BasisAmount'],
    default: '0.00',
  },
  {
    id: 'vatCategoryCode',
    label: 'VAT category code',
    description:
      'UNTDID 5305 tax category code. S = standard rate, Z = zero rated, E = exempt, AE = reverse charge.',
    type: 'text',
    xmlLeaf: ['ram:CategoryCode'],
    default: 'S',
  },
  {
    id: 'vatRatePercent',
    label: 'VAT rate (%)',
    description: 'Applicable VAT rate as a percentage (e.g. 20.00).',
    type: 'number',
    xmlLeaf: ['ram:RateApplicablePercent'],
    default: '20.00',
  },
];

/**
 * One column of an invoice line row. Kept separate from FieldDef/FIELD_DEFS since
 * line items are a repeatable structure (zero or more rows) rather than a single
 * document-wide value. `xmlLeaf` is relative to one
 * <ram:IncludedSupplyChainTradeLineItem> element.
 */
export interface LineItemFieldDef {
  id: string;
  label: string;
  description: string;
  type: FieldType;
  xmlLeaf: string[];
  attribute?: { name: string; value: string };
  default?: string;
}

// Order matters here too, matching SupplyChainTradeLineItemType's schema sequence:
// AssociatedDocumentLineDocument, SpecifiedTradeProduct, SpecifiedLineTradeAgreement,
// SpecifiedLineTradeDelivery, SpecifiedLineTradeSettlement (whose own ApplicableTradeTax
// is itself ordered CalculatedAmount/TypeCode/BasisAmount/CategoryCode/RateApplicablePercent).
export const LINE_ITEM_FIELD_DEFS: LineItemFieldDef[] = [
  {
    id: 'lineId',
    label: 'Line #',
    description: 'Sequential line number within the invoice.',
    type: 'text',
    xmlLeaf: ['ram:AssociatedDocumentLineDocument', 'ram:LineID'],
  },
  {
    id: 'productName',
    label: 'Product / service',
    description: 'Name of the product or service billed on this line.',
    type: 'text',
    xmlLeaf: ['ram:SpecifiedTradeProduct', 'ram:Name'],
  },
  {
    id: 'unitPrice',
    label: 'Net unit price',
    description: 'Net price per unit, excluding VAT.',
    type: 'number',
    xmlLeaf: ['ram:SpecifiedLineTradeAgreement', 'ram:NetPriceProductTradePrice', 'ram:ChargeAmount'],
  },
  {
    id: 'quantity',
    label: 'Quantity',
    description: 'Billed quantity.',
    type: 'number',
    xmlLeaf: ['ram:SpecifiedLineTradeDelivery', 'ram:BilledQuantity'],
    attribute: { name: 'unitCode', value: 'C62' },
    default: '1',
  },
  {
    id: 'vatTypeCode',
    label: 'Tax type code',
    description: 'UNTDID 5153 tax type code for this line. VAT for standard European value-added tax.',
    type: 'text',
    xmlLeaf: ['ram:SpecifiedLineTradeSettlement', 'ram:ApplicableTradeTax', 'ram:TypeCode'],
    default: 'VAT',
  },
  {
    id: 'vatCategoryCode',
    label: 'VAT category code',
    description:
      'UNTDID 5305 tax category code. S = standard rate, Z = zero rated, E = exempt, AE = reverse charge.',
    type: 'text',
    xmlLeaf: ['ram:SpecifiedLineTradeSettlement', 'ram:ApplicableTradeTax', 'ram:CategoryCode'],
    default: 'S',
  },
  {
    id: 'vatRatePercent',
    label: 'VAT rate (%)',
    description: 'Applicable VAT rate as a percentage for this line (e.g. 20.00).',
    type: 'number',
    xmlLeaf: ['ram:SpecifiedLineTradeSettlement', 'ram:ApplicableTradeTax', 'ram:RateApplicablePercent'],
    default: '20.00',
  },
  {
    id: 'lineTotal',
    label: 'Line total',
    description: 'Net total amount for this line (quantity x unit price), excluding VAT.',
    type: 'number',
    xmlLeaf: [
      'ram:SpecifiedLineTradeSettlement',
      'ram:SpecifiedTradeSettlementLineMonetarySummation',
      'ram:LineTotalAmount',
    ],
  },
];
