// Conventional Commits enforcement (CLAUDE.md §13.3, §19).
// Run on the commit-msg hook (.husky/commit-msg). Keep the allowed types in
// sync with docs/conventions.md §13.3.
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'chore', 'docs', 'test', 'build', 'ci', 'perf', 'revert'],
    ],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
  },
}
