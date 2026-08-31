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

async function loadSchemaBundle(
  extensionUri: vscode.Uri,
  profile: FacturXProfile,
): Promise<SchemaBundle> {
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
    message: error.message,
    line: error.loc?.lineNumber,
  }));
}
