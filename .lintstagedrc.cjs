// lint-staged config (monorepo-aware).
//
// ESLint runs as a full pass in .husky/pre-commit (not here) because
// type-aware TypeScript linting loads the entire tsconfig program and cannot
// run cheaply per-file. Prettier is file-scoped and fast, so it stays here.
module.exports = {
  '**/*.{ts,tsx,js,cjs,mjs,json,md,yml,yaml,css}': 'prettier --check',
}
