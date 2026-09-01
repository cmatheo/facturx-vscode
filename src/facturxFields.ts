import { FacturXProfile } from './facturxProfile';
import {
  FIELD_DEFS,
  isFieldAvailable,
  LINE_ITEM_FIELD_DEFS,
  VAT_BREAKDOWN_FIELD_DEFS,
  areLineItemsAvailable,
  isVatBreakdownAvailable,
} from './facturxFieldDefs';

// Field/profile-availability data lives in facturxFieldDefs.ts; re-exported here so
// this stays the single import path for both the data and the engine that consumes it.
export type {
  FieldType,
  FieldDef,
  VatBreakdownFieldDef,
  LineItemFieldDef,
} from './facturxFieldDefs';
export {
  isFieldAvailable,
  FIELD_DEFS,
  isFieldMandatory,
  LINE_ITEMS_AVAILABLE_FROM,
  areLineItemsAvailable,
  VAT_BREAKDOWN_AVAILABLE_FROM,
  isVatBreakdownAvailable,
  VAT_BREAKDOWN_FIELD_DEFS,
  LINE_ITEM_FIELD_DEFS,
} from './facturxFieldDefs';

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
