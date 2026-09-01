// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['out/**', 'node_modules/**', 'xsd/**', '.vscode-test/**', 'l10n/**', '.claude/**'],
  },
  eslint.configs.recommended,
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
    // CommonJS scripts that run directly under Node (not part of the tsconfig TS
    // project): config files like commitlint.config.js, and the build/package
    // scripts under scripts/ plus esbuild.js. Placed after typescript-eslint's
    // recommended preset (whose languageOptions/rules apply file-pattern-free by
    // default) so these overrides actually win for the files they target.
    files: ['*.config.js', '*.config.cjs', 'scripts/**/*.js', 'esbuild.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'writable',
        require: 'readonly',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
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
