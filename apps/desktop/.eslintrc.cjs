module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
    browser: true,
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
    // Type-aware linting (required for no-floating-promises). The dedicated
    // tsconfig.eslint.json includes every lintable file so the parser never
    // hits a "file not in project" error.
    project: ['./tsconfig.eslint.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'import', 'promise', 'react', 'react-hooks'],
  // NOTE: eslint-plugin-import's module-resolution rules (no-unresolved,
  // namespace, default, named, no-named-as-default*) are intentionally NOT
  // enabled. TypeScript already verifies that every import resolves, and the
  // import plugin's resolver produces large numbers of false positives against
  // this repo's bundler module resolution + path aliases + .ts extensions.
  // We keep only import/order, which TypeScript does not cover.
  rules: {
    // §19.1 — No any
    '@typescript-eslint/no-explicit-any': 'error',
    // §19.3 — No floating promises (type-aware). Use await or explicit void.
    '@typescript-eslint/no-floating-promises': 'error',
    // §19.9 — No console in production code. warn/error are allowed only in the
    // main-process error handlers (see the electron/main.ts override below).
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
        ],
        pathGroupsExcludedImportTypes: ['builtin'],
        // Ordering + grouping is enforced; blank-line spacing between groups is
        // left to the author / Prettier (avoids fixer deadlock with type-import
        // groups). §19.1 / §13.2 only require deterministic import ordering.
        'newlines-between': 'ignore',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    // §3.1 — lodash is not in the stack; if ever needed, use the ES build.
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'lodash',
            message: 'Use lodash-es (tree-shakeable ESM) instead of lodash.',
          },
        ],
        patterns: [
          {
            group: ['lodash/*'],
            message: 'Use lodash-es (tree-shakeable ESM) instead of lodash.',
          },
        ],
      },
    ],
    // React 18 doesn't need React in scope
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    // Enforce strict null checks patterns
    '@typescript-eslint/no-non-null-assertion': 'error',
    // Allow intentional unused args/vars when prefixed with _
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
  },
  settings: {
    react: {
      version: 'detect',
    },
    // Let eslint-plugin-import resolve TS path aliases (@/* and @shared/*).
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        noWarnOnMultipleProjects: true,
        project: ['./tsconfig.json', './tsconfig.node.json'],
      },
      node: true,
    },
  },
  overrides: [
    {
      // §19.9 — the main process may log to console in its error/diagnostic
      // handlers (no renderer to surface them to before the window exists).
      files: ['electron/main.ts'],
      rules: {
        'no-console': ['error', { allow: ['warn', 'error'] }],
      },
    },
    {
      // Test files. import/order is disabled here because Vitest hoists
      // vi.mock() factories above the import block, so these files must
      // interleave imports with mock setup — the rule cannot safely reorder
      // across that boundary and the fixer deadlocks. Tests may also log
      // diagnostics (e.g. surfacing renderer pageerror in e2e). Correctness
      // rules (no-floating-promises, no-explicit-any) stay ON.
      files: ['tests/**/*.{ts,tsx}'],
      rules: {
        'import/order': 'off',
        'no-console': 'off',
      },
    },
  ],
  ignorePatterns: ['node_modules/', 'out/', 'dist/', '*.config.js', '*.config.cjs'],
}
