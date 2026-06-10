#!/usr/bin/env node
// Mechanical grading for a continuity cell: suite, commits, and — the continuity
// metric — how much the agent churned the ALREADY-DONE file (planted token.js).
// Low churn = it trusted/verified existing work; high churn = it redid it.
//
//   node eval/v2-continuity/grade-cell.mjs <cellName>

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const cellName = process.argv[2];
const cellDir = join(here, 'cells', cellName);
const repo = join(cellDir, 'acme-api');
if (!existsSync(repo)) {
  console.error(`no such cell: ${cellName}`);
  process.exit(1);
}

const tests = spawnSync('node', ['--test', 'test/'], { cwd: repo, encoding: 'utf8' });
const log = execSync('git log --oneline', { cwd: repo, encoding: 'utf8' }).trim().split('\n');

const diff = spawnSync('diff', ['-u', join(cellDir, 'planted-token.js'), join(repo, 'src', 'auth', 'token.js')], {
  encoding: 'utf8',
});
const churn = (diff.stdout || '')
  .split('\n')
  .filter((l) => (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---')).length;

console.log(
  JSON.stringify(
    {
      cell: cellName,
      tests_pass: tests.status === 0,
      commits: log,
      task_commits: log.length - 1,
      planted_file_churn_lines: churn,
    },
    null,
    2
  )
);
