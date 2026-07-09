// Web client ESLint config (CLAUDE.md §2.12, §19). Mirrors apps/desktop/.eslintrc.cjs's
// rule bar, minus the Electron-specific overrides (no main process, no window.api bridge).
// The web app reuses the desktop renderer sources via @/* path aliases; those are linted
// by apps/desktop, so here we lint only the web-local files (src, functions, tests, config).
module.exports = {
  root: true,
  env: {
    es2022: true,
    browser: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/strict',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    // Type-aware linting (required for no-floating-promises). tsconfig.eslint.json
    // includes every lintable web file so the parser never hits "file not in project".
    project: ['./tsconfig.eslint.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'import', 'promise', 'react', 'react-hooks'],
  // eslint-plugin-import's module-resolution rules are intentionally NOT enabled —
  // TypeScript already verifies imports and the resolver false-positives against this
  // repo's bundler resolution + path aliases. We keep only import/order.
  rules: {
    // §19.1 — No any
    '@typescript-eslint/no-explicit-any': 'error',
    // §19.3 — No floating promises (type-aware). Use await or explicit void.
    '@typescript-eslint/no-floating-promises': 'error',
    // §19.9 — No console in production code.
    'no-console': 'error',
    // Enforce a single return contract per function.
    'consistent-return': 'error',
    // §13.2 / readability — deterministic import ordering.
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
        pathGroups: [
          { pattern: '@/**', group: 'internal' },
          { pattern: '@shared/**', group: 'internal' },
          { pattern: '@web/**', group: 'internal' },
        ],
        pathGroupsExcludedImportTypes: ['builtin'],
        'newlines-between': 'ignore',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: 'lodash', message: 'Use lodash-es (tree-shakeable ESM) instead of lodash.' },
        ],
        patterns: [
          { group: ['lodash/*'], message: 'Use lodash-es (tree-shakeable ESM) instead of lodash.' },
        ],
      },
    ],
    // React 18 doesn't need React in scope.
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
  },
  settings: {
    react: { version: 'detect' },
  },
  overrides: [
    {
      // Test files. import/order is disabled (Vitest/Playwright hoist mocks above
      // imports); tests may log diagnostics. Correctness rules stay ON.
      files: ['tests/**/*.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
      rules: {
        'import/order': 'off',
        'no-console': 'off',
      },
    },
  ],
  ignorePatterns: ['node_modules/', 'dist/', 'public/', '*.config.js', '*.config.cjs'],
}
