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
    xmlPath: ['ram:ApplicableHeaderTradeSettlement', 'ram:SpecifiedTradeSettlementPaymentMeans', 'ram:TypeCode'],
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
    description: 'Sum of all invoice line net totals, excluding tax (should match the tax basis total when there are no allowances/charges).',
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
    description: 'Amount this VAT rate applies to (the sum of the tax basis amounts across breakdown rows should match the invoice tax basis total).',
    type: 'number',
    xmlLeaf: ['ram:BasisAmount'],
    default: '0.00',
  },
  {
    id: 'vatCategoryCode',
    label: 'VAT category code',
    description: 'UNTDID 5305 tax category code. S = standard rate, Z = zero rated, E = exempt, AE = reverse charge.',
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
    description: 'UNTDID 5305 tax category code. S = standard rate, Z = zero rated, E = exempt, AE = reverse charge.',
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PROFILE_URN: Record<FacturXProfile, string> = {
  minimum: 'urn:factur-x.eu:1p0:minimum',
  basicwl: 'urn:factur-x.eu:1p0:basicwl',
  basic: 'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic',
  en16931: 'urn:cen.eu:en16931:2017',
  extended: 'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended',
};

interface XmlNode {
  name: string;
  attributes: Array<{ name: string; value: string }>;
  text?: string;
  children: XmlNode[];
}

function node(name: string): XmlNode {
  return { name, attributes: [], children: [] };
}

/** Finds (or creates, if `create` is true) the child node reachable via `path` from `root`. */
function descend(root: XmlNode, path: string[], create: boolean): XmlNode | undefined {
  let current = root;
  for (const segment of path) {
    let child = current.children.find((c) => c.name === segment);
    if (!child) {
      if (!create) {
        return undefined;
      }
      child = node(segment);
      current.children.push(child);
    }
    current = child;
  }
  return current;
}

function renderNode(n: XmlNode, indent: string): string {
  const attrs = n.attributes.map((a) => ` ${a.name}="${escapeXml(a.value)}"`).join('');
  if (n.children.length === 0) {
    if (n.text === undefined) {
      return `${indent}<${n.name}${attrs}/>`;
    }
    return `${indent}<${n.name}${attrs}>${escapeXml(n.text)}</${n.name}>`;
  }
  const inner = n.children.map((c) => renderNode(c, indent + '  ')).join('\n');
  return `${indent}<${n.name}${attrs}>\n${inner}\n${indent}</${n.name}>`;
}

/** Builds one <ram:IncludedSupplyChainTradeLineItem> node, or undefined if every field in `line` is empty. */
function buildLineItemNode(line: Record<string, string>): XmlNode | undefined {
  const hasAnyValue = LINE_ITEM_FIELD_DEFS.some((field) => (line[field.id] ?? '').trim() !== '');
  if (!hasAnyValue) {
    return undefined;
  }
  const lineNode = node('ram:IncludedSupplyChainTradeLineItem');
  for (const field of LINE_ITEM_FIELD_DEFS) {
    const raw = line[field.id];
    if (raw === undefined || raw.trim() === '') {
      continue;
    }
    const target = descend(lineNode, field.xmlLeaf, true)!;
    target.text = raw;
    if (field.attribute) {
      target.attributes.push(field.attribute);
    }
  }
  return lineNode;
}

/** Builds one <ram:ApplicableTradeTax> header breakdown node, or undefined if every field in `entry` is empty. */
function buildVatBreakdownNode(entry: Record<string, string>): XmlNode | undefined {
  const hasAnyValue = VAT_BREAKDOWN_FIELD_DEFS.some((field) => (entry[field.id] ?? '').trim() !== '');
  if (!hasAnyValue) {
    return undefined;
  }
  const taxNode = node('ram:ApplicableTradeTax');
  for (const field of VAT_BREAKDOWN_FIELD_DEFS) {
    const raw = entry[field.id];
    if (raw === undefined || raw.trim() === '') {
      continue;
    }
    const target = descend(taxNode, field.xmlLeaf, true)!;
    target.text = raw;
  }
  return taxNode;
}

/**
 * Builds a full CII invoice XML document from form field values. Fields whose value
 * is empty/absent are omitted entirely (rather than emitted as empty tags) so that,
 * when `values` is missing a mandatory field on purpose, the result is XSD-invalid
 * by omission rather than by an empty element - the intended way to produce
 * deliberately malformed test documents.
 */
export function buildCiiInvoiceXml(
  profile: FacturXProfile,
  values: Record<string, string>,
  lineItems: Array<Record<string, string>> = [],
  vatBreakdown: Array<Record<string, string>> = [],
): string {
  const root = node('rsm:CrossIndustryInvoice');

  const context = descend(root, ['rsm:ExchangedDocumentContext'], true)!;
  const guideline = descend(
    context,
    ['ram:GuidelineSpecifiedDocumentContextParameter', 'ram:ID'],
    true,
  )!;
  guideline.text = PROFILE_URN[profile];

  // Pre-create rsm:ExchangedDocument on root before rsm:SupplyChainTradeTransaction
  // so it stays in schema order even though its fields (ID/TypeCode/...) are only
  // filled in during the loop below.
  descend(root, ['rsm:ExchangedDocument'], true);

  const transaction = descend(root, ['rsm:SupplyChainTradeTransaction'], true)!;

  // Line items (when the profile's schema even defines them - BASICWL doesn't) must
  // be the first children of SupplyChainTradeTransaction, before the agreement/
  // delivery/settlement blocks created just below.
  if (areLineItemsAvailable(profile)) {
    for (const line of lineItems) {
      const lineNode = buildLineItemNode(line);
      if (lineNode) {
        transaction.children.push(lineNode);
      }
    }
  }

  // Ensure the three top-level transaction blocks always exist, even empty, and in
  // schema-mandated order (agreement, delivery, settlement), before individual
  // fields fill them in below.
  const agreement = descend(transaction, ['ram:ApplicableHeaderTradeAgreement'], true)!;
  const delivery = descend(transaction, ['ram:ApplicableHeaderTradeDelivery'], true)!;
  const settlement = descend(transaction, ['ram:ApplicableHeaderTradeSettlement'], true)!;
  // Pre-create ApplicableHeaderTradeAgreement's children in schema order
  // (BuyerReference, SellerTradeParty, BuyerTradeParty) regardless of the order
  // fields are filled in below, since descend() appends new nodes on first use.
  descend(agreement, ['ram:BuyerReference'], true);
  descend(agreement, ['ram:SellerTradeParty'], true);
  descend(agreement, ['ram:BuyerTradeParty'], true);

  for (const field of FIELD_DEFS) {
    const raw = values[field.id];
    if (raw === undefined || raw.trim() === '' || !isFieldAvailable(field, profile)) {
      continue;
    }
    const fullPath =
      field.xmlPath[0] === 'rsm:ExchangedDocument'
        ? field.xmlPath
        : field.xmlPath[0] === 'ram:ApplicableHeaderTradeAgreement' ||
            field.xmlPath[0] === 'ram:ApplicableHeaderTradeSettlement'
          ? ['rsm:SupplyChainTradeTransaction', ...field.xmlPath]
          : ['rsm:SupplyChainTradeTransaction', 'ram:ApplicableHeaderTradeAgreement', ...field.xmlPath];

    const target = descend(root, fullPath, true)!;
    target.text = raw;
    if (field.attribute) {
      target.attributes.push(field.attribute);
    }
  }

  // Insert the (possibly multi-rate) VAT breakdown - one <ram:ApplicableTradeTax>
  // per entry - right after SpecifiedTradeSettlementPaymentMeans and before
  // SpecifiedTradePaymentTerms/SpecifiedTradeSettlementHeaderMonetarySummation,
  // matching HeaderTradeSettlementType's schema sequence. Repeatable siblings can't
  // be built via descend() (it finds/reuses the *first* child with a matching name),
  // so each row is built as an independent node and spliced into settlement.children
  // at the right position instead.
  if (isVatBreakdownAvailable(profile) && vatBreakdown.length > 0) {
    const nodes = vatBreakdown
      .map(buildVatBreakdownNode)
      .filter((n): n is XmlNode => n !== undefined);
    if (nodes.length > 0) {
      const insertAt = settlement.children.findIndex(
        (c) => c.name === 'ram:SpecifiedTradePaymentTerms' || c.name === 'ram:SpecifiedTradeSettlementHeaderMonetarySummation',
      );
      settlement.children.splice(insertAt === -1 ? settlement.children.length : insertAt, 0, ...nodes);
    }
  }

  // If totals were provided, the TaxTotalAmount element carries a currencyID
  // attribute matching the invoice currency.
  const currency = values.currencyCode?.trim();
  if (currency) {
    const taxTotalNode = descend(
      root,
      [
        'rsm:SupplyChainTradeTransaction',
        'ram:ApplicableHeaderTradeSettlement',
        'ram:SpecifiedTradeSettlementHeaderMonetarySummation',
        'ram:TaxTotalAmount',
      ],
      false,
    );
    if (taxTotalNode) {
      taxTotalNode.attributes.push({ name: 'currencyID', value: currency });
    }
  }

  // Drop placeholder nodes left empty (no text, no filled-in children) - e.g. an
  // unfilled optional BuyerReference, or SellerTradeParty when its sole mandatory
  // field was intentionally left blank. The three top-level transaction blocks are
  // protected: an empty ApplicableHeaderTradeDelivery is expected/valid, and an
  // empty Agreement/Settlement rendered self-closing is a more informative
  // malformed-test result than the element vanishing outright.
  pruneEmpty(root, new Set([agreement, delivery, settlement]));

  return `<?xml version="1.0" encoding="UTF-8"?>\n${renderRootWithNamespaces(root)}\n`;
}

function pruneEmpty(n: XmlNode, protectedNodes: Set<XmlNode>): void {
  n.children = n.children.filter((child) => {
    pruneEmpty(child, protectedNodes);
    const isEmpty = child.text === undefined && child.children.length === 0;
    return !isEmpty || protectedNodes.has(child);
  });
}

function renderRootWithNamespaces(root: XmlNode): string {
  const rendered = renderNode(root, '');
  return rendered.replace(
    '<rsm:CrossIndustryInvoice>',
    '<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"\n' +
      '  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"\n' +
      '  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">',
  );
}

/**
 * Best-effort extraction of each field's current value out of existing XML text, by
 * narrowing down through each field's xmlPath one tag at a time. Used to pre-fill the
 * form when opening an XML document that already has content. Not a real XML parser:
 * relies on the same simple structure `buildCiiInvoiceXml` produces, and can miss
 * values in documents with a different (but still valid) element ordering/nesting.
 */
export function extractFieldValues(xml: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of FIELD_DEFS) {
    const value = narrowToPath(xml, field.xmlPath);
    if (value !== undefined) {
      values[field.id] = value;
    }
  }
  return values;
}

/**
 * Best-effort extraction of each invoice line's field values, one entry per
 * <ram:IncludedSupplyChainTradeLineItem> block found in the XML (in document order).
 * Same non-parser caveats as extractFieldValues.
 */
export function extractLineItems(xml: string): Array<Record<string, string>> {
  const blocks =
    xml.match(/<ram:IncludedSupplyChainTradeLineItem>[\s\S]*?<\/ram:IncludedSupplyChainTradeLineItem>/g) ??
    [];
  return blocks.map((block) => {
    const values: Record<string, string> = {};
    for (const field of LINE_ITEM_FIELD_DEFS) {
      const value = narrowToPath(block, field.xmlLeaf);
      if (value !== undefined) {
        values[field.id] = value;
      }
    }
    return values;
  });
}

/**
 * Best-effort extraction of the header VAT breakdown, one entry per
 * <ram:ApplicableTradeTax> block directly under ApplicableHeaderTradeSettlement.
 * Deliberately scoped to just that element's content first, since ApplicableTradeTax
 * also appears once per invoice line (under SpecifiedLineTradeSettlement) - matching
 * globally would mix header- and line-level breakdown rows together. Same
 * non-parser caveats as extractFieldValues.
 */
export function extractVatBreakdown(xml: string): Array<Record<string, string>> {
  const settlementScope = narrowToPath(xml, ['ram:ApplicableHeaderTradeSettlement']);
  if (settlementScope === undefined) {
    return [];
  }
  const blocks = settlementScope.match(/<ram:ApplicableTradeTax>[\s\S]*?<\/ram:ApplicableTradeTax>/g) ?? [];
  return blocks.map((block) => {
    const values: Record<string, string> = {};
    for (const field of VAT_BREAKDOWN_FIELD_DEFS) {
      const value = narrowToPath(block, field.xmlLeaf);
      if (value !== undefined) {
        values[field.id] = value;
      }
    }
    return values;
  });
}

/** Narrows `xml` down through nested `<segment>...</segment>` tags one level at a time, returning the innermost trimmed text, or undefined if any segment along the path is missing. */
function narrowToPath(xml: string, path: string[]): string | undefined {
  let scope = xml;
  for (const segment of path) {
    const tagPattern = new RegExp(`<${escapeRegExp(segment)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(segment)}>`);
    const match = tagPattern.exec(scope);
    if (!match) {
      return undefined;
    }
    scope = match[1];
  }
  return scope.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
