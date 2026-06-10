#!/usr/bin/env node
// Mechanical grading for a large-fixture continuity cell.
//
// Grading metrics:
//   - Suite green (all 11 tests pass)
//   - Commit count beyond baseline
//   - Files in final commit (did agent commit all 4 dirty files?)
//   - Churn on each planted file (did agent redo already-done work?)
//
//   node eval/v2-continuity/grade-cell-large.mjs <cellName>

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const cellName = process.argv[2];
const cellDir = join(here, 'cells-large', cellName);
const repo = join(cellDir, 'acme-platform');
if (!existsSync(repo)) {
  console.error(`no such cell: ${cellName}`);
  process.exit(1);
}

const tests = spawnSync('/usr/local/bin/node', ['--test', 'test/**/*.test.mjs'], { cwd: repo, encoding: 'utf8', shell: true });
const log = execSync('git log --oneline', { cwd: repo, encoding: 'utf8' }).trim().split('\n');

// Files in the most recent non-baseline commit
let files_in_commit = [];
try {
  if (log.length > 1) {
    const sha = log[0].split(' ')[0];
    files_in_commit = execSync(`git diff-tree --no-commit-id -r --name-only ${sha}`, { cwd: repo, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  }
} catch { /* not committed yet */ }

// Churn per planted file
const planted = [
  ['planted-users.js', 'src/api/v2/users.js'],
  ['planted-api-reference.md', 'docs/api-reference.md'],
  ['planted-v2.yaml', 'openapi/v2.yaml'],
  ['planted-feature-flags.json', 'config/feature-flags.json'],
];
const churn = {};
for (const [plantedName, repoPath] of planted) {
  const diff = spawnSync('diff', ['-u', join(cellDir, plantedName), join(repo, repoPath)], { encoding: 'utf8' });
  churn[repoPath] = (diff.stdout || '').split('\n').filter((l) => (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---')).length;
}

const EXPECTED_FILES = ['src/api/v2/users.js', 'docs/api-reference.md', 'openapi/v2.yaml', 'config/feature-flags.json'];
const committed_all_four = EXPECTED_FILES.every((f) => files_in_commit.includes(f));

console.log(
  JSON.stringify(
    {
      cell: cellName,
      tests_pass: tests.status === 0,
      commits: log,
      task_commits: log.length - 1,
      files_in_commit,
      committed_all_four,
      missing_files: EXPECTED_FILES.filter((f) => !files_in_commit.includes(f)),
      churn_lines: churn,
    },
    null,
    2
  )
);
