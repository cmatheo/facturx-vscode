/**
 * Minimal stand-in for the parts of the `vscode` module that src/xsdValidator.ts
 * touches, so it can be unit tested with plain Node fs instead of a full VS Code
 * extension host. Only implements what's actually used — not a general mock.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Dirent } from 'node:fs';

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

export class Uri {
  private constructor(readonly fsPath: string) {}

  static file(fsPath: string): Uri {
    return new Uri(fsPath);
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(path.join(base.fsPath, ...segments));
  }

  toString(): string {
    return `file://${this.fsPath}`;
  }
}

export const workspace = {
  fs: {
    async readDirectory(uri: Uri): Promise<Array<[string, FileType]>> {
      const entries: Dirent[] = await fs.readdir(uri.fsPath, { withFileTypes: true });
      return entries.map((entry) => [
        entry.name,
        entry.isDirectory() ? FileType.Directory : FileType.File,
      ]);
    },
    async readFile(uri: Uri): Promise<Uint8Array> {
      const buffer = await fs.readFile(uri.fsPath);
      return new Uint8Array(buffer);
    },
  },
};
