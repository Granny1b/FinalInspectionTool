// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'api/deploy/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.azurite/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  // Node code: api, seed, tooling, e2e
  {
    files: [
      'api/**/*.ts',
      'seed/**/*.ts',
      'e2e/**/*.ts',
      'api/scripts/**/*.mjs',
      'scripts/**/*.mjs',
      '*.{js,mjs,ts}',
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  // Browser code: the React app
  {
    files: ['app/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  // Static pages served before login (no bundler)
  {
    files: ['app/public/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  prettier,
);
