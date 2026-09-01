// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['out/**', 'node_modules/**', 'xsd/**', '.vscode-test/**', 'l10n/**'],
  },
  eslint.configs.recommended,
  {
    // CommonJS config files that run directly under Node (not part of the tsconfig
    // TS project), e.g. commitlint.config.js.
    files: ['*.config.js', '*.config.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly' },
    },
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The webview's client-side scripts run in the browser, not Node - they use
    // browser globals (document, window, acquireVsCodeApi) and aren't part of the
    // tsconfig TS project, so they're linted as plain scripts rather than with the
    // type-aware TS ruleset above.
    files: ['media/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        acquireVsCodeApi: 'readonly',
      },
    },
  },
  eslintConfigPrettier,
);
