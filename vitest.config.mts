import { defineConfig } from 'vitest/config';
import * as path from 'node:path';

const dirname = path.dirname(new URL(import.meta.url).pathname);

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      vscode: path.resolve(dirname, 'test/mocks/vscode.ts'),
    },
  },
});
