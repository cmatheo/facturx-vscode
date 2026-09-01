import * as vscode from 'vscode';
import { validateXML } from 'xmllint-wasm';
import { FacturXProfile } from './facturxProfile';

export interface XsdValidationError {
  message: string;
  line: number | undefined;
}

const PROFILE_MAIN_XSD: Record<FacturXProfile, string> = {
  minimum: 'Factur-X_MINIMUM.xsd',
  basicwl: 'Factur-X_BASICWL.xsd',
  basic: 'Factur-X_BASIC.xsd',
  en16931: 'Factur-X_EN16931.xsd',
  extended: 'Factur-X_EXTENDED.xsd',
};

interface SchemaBundle {
  main: string;
  preload: Array<{ fileName: string; contents: string }>;
}

const schemaCache = new Map<FacturXProfile, Promise<SchemaBundle>>();

async function loadSchemaBundle(extensionUri: vscode.Uri, profile: FacturXProfile): Promise<SchemaBundle> {
  const dirUri = vscode.Uri.joinPath(extensionUri, 'xsd', profile);
  const entries = await vscode.workspace.fs.readDirectory(dirUri);
  const xsdNames = entries
    .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.xsd'))
    .map(([name]) => name);

  const mainName = PROFILE_MAIN_XSD[profile];
  if (!xsdNames.includes(mainName)) {
    throw new Error(`Main XSD "${mainName}" not found for profile "${profile}"`);
  }

  const decoder = new TextDecoder('utf-8');
  const files = await Promise.all(
    xsdNames.map(async (name) => {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(dirUri, name));
      return { fileName: name, contents: decoder.decode(bytes) };
    }),
  );

  const main = files.find((file) => file.fileName === mainName)!.contents;
  const preload = files.filter((file) => file.fileName !== mainName);
  return { main, preload };
}

function getSchemaBundle(extensionUri: vscode.Uri, profile: FacturXProfile): Promise<SchemaBundle> {
  let cached = schemaCache.get(profile);
  if (!cached) {
    cached = loadSchemaBundle(extensionUri, profile);
    schemaCache.set(profile, cached);
  }
  return cached;
}

/**
 * Validates CII XML against the Factur-X XSD schema matching the given profile.
 * Throws if the schema bundle itself fails to load/parse; returns an empty array
 * (not a throw) when the XML is well-formed and schema-valid.
 */
export async function validateAgainstXsd(
  extensionUri: vscode.Uri,
  profile: FacturXProfile,
  xml: string,
): Promise<XsdValidationError[]> {
  const bundle = await getSchemaBundle(extensionUri, profile);

  const result = await validateXML({
    xml: [{ fileName: 'invoice.xml', contents: xml }],
    schema: [bundle.main],
    preload: bundle.preload,
  });

  if (result.valid) {
    return [];
  }

  return result.errors.map((error) => ({
    message: humanizeXsdMessage(error.message),
    line: error.loc?.lineNumber,
  }));
}

/** Strips the `{urn:...}` namespace prefix libxml2 puts in front of every element name,
 * leaving just the local tag name (e.g. `{urn:...:100}ApplicableTradeTax` -> `ApplicableTradeTax`). */
function stripNamespaces(text: string): string {
  return text.replace(/\{[^}]*\}/g, '');
}

/** Turns a parenthesised, space-separated libxml2 element list into a readable comma list:
 * "( {ns}A, {ns}B )" -> "A, B". */
function formatElementList(rawList: string): string {
  return stripNamespaces(rawList)
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .join(', ');
}

/**
 * Rewrites raw libxml2/xmllint schema-validation messages into something a user editing
 * Factur-X XML (rather than the underlying XSD) can actually act on: strips the verbose
 * namespace URIs, and for the three most common/confusing cases (an out-of-order or extra
 * element, a missing mandatory child, a wrong root element) adds a plain-English explanation
 * of what to do. These are matched by the exact English wording libxml2 currently emits, so
 * an xmllint-wasm upgrade that rewords its messages could silently widen the fallback below
 * rather than erroring; xsdValidator.test.ts exercises this against the real library to catch
 * that. Any other message shape (type/pattern/enumeration mismatches, etc.) falls through to
 * just having its namespaces stripped, unchanged otherwise.
 */
export function humanizeXsdMessage(raw: string): string {
  const trimmed = raw.trim();

  const notExpectedMatch =
    /^Element '([^']+)': This element is not expected\.(?: Expected is (?:one of )?\(([^)]*)\)\.)?$/.exec(
      trimmed,
    );
  if (notExpectedMatch) {
    const element = stripNamespaces(notExpectedMatch[1]);
    const expectedRaw = notExpectedMatch[2];
    if (expectedRaw) {
      const expected = formatElementList(expectedRaw);
      return (
        `Unexpected element <${element}> here. At this point, the schema expects one of: ${expected}. ` +
        `This usually means <${element}> is out of order, or a mandatory element is missing before it.`
      );
    }
    return `Unexpected element <${element}> here — no further elements are allowed at this point (it may be duplicated, or misplaced).`;
  }

  const missingChildMatch =
    /^Element '([^']+)': Missing child element\(s\)\. Expected is \(([^)]*)\)\.$/.exec(trimmed);
  if (missingChildMatch) {
    const element = stripNamespaces(missingChildMatch[1]);
    const expected = formatElementList(missingChildMatch[2]);
    return `<${element}> is missing a required child element: ${expected}.`;
  }

  const noRootMatch =
    /^Element '([^']+)': No matching global declaration available for the validation root\.$/.exec(trimmed);
  if (noRootMatch) {
    const element = stripNamespaces(noRootMatch[1]);
    return `<${element}> is not a valid root element for this schema — check the document's declared Factur-X profile.`;
  }

  return stripNamespaces(raw);
}
