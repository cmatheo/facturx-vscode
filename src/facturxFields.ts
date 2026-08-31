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

/**
 * Builds a full CII invoice XML document from form field values. Fields whose value
 * is empty/absent are omitted entirely (rather than emitted as empty tags) so that,
 * when `values` is missing a mandatory field on purpose, the result is XSD-invalid
 * by omission rather than by an empty element - the intended way to produce
 * deliberately malformed test documents.
 */
export function buildCiiInvoiceXml(profile: FacturXProfile, values: Record<string, string>): string {
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
    let scope = xml;
    let found = true;
    for (const segment of field.xmlPath) {
      const tagPattern = new RegExp(`<${escapeRegExp(segment)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(segment)}>`);
      const match = tagPattern.exec(scope);
      if (!match) {
        found = false;
        break;
      }
      scope = match[1];
    }
    if (found) {
      values[field.id] = scope.trim();
    }
  }
  return values;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
