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
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  rules: {
    // §13.1 — No any
    '@typescript-eslint/no-explicit-any': 'error',
    // React 18 doesn't need React in scope
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    // Allow console in Electron main/preload
    'no-console': 'off',
    // Enforce strict null checks patterns
    '@typescript-eslint/no-non-null-assertion': 'error',
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  ignorePatterns: [
    'node_modules/',
    'out/',
    'dist/',
    '*.config.js',
    '*.config.cjs',
  ],
}
