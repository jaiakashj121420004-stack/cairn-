module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/strict', 'prettier'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    // Type-aware linting (required for no-floating-promises).
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'import', 'promise'],
  rules: {
    // §19.1 — No any.
    '@typescript-eslint/no-explicit-any': 'error',
    // §19.3 — No floating promises (type-aware). Use await or explicit void.
    '@typescript-eslint/no-floating-promises': 'error',
    // §19.9 — No console in server code. Use the pino logger.
    'no-console': 'error',
    'consistent-return': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
        pathGroups: [{ pattern: '@/**', group: 'internal' }],
        pathGroupsExcludedImportTypes: ['builtin'],
        'newlines-between': 'ignore',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
  },
  overrides: [
    {
      // Tests may interleave imports with setup and log diagnostics. Correctness
      // rules (no-floating-promises, no-explicit-any) stay ON.
      files: ['tests/**/*.ts'],
      rules: {
        'import/order': 'off',
        'no-console': 'off',
      },
    },
  ],
  ignorePatterns: ['node_modules/', 'dist/', 'drizzle/', '*.config.ts', '*.config.cjs'],
}
