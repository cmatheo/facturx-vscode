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
