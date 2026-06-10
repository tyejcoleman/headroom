#!/usr/bin/env node
// G2-sim v2 (large fixture): post-compaction continuity on a multi-file migration.
//
// Scenario: 4 dirty files (code + docs + openapi + config) already written but
// uncommitted. The lossy compaction summary mentions only the code file. The equipped
// agent gets a snapshot listing all 4. The question: does the agent commit ALL 4 files?
//
//   node eval/v2-continuity/setup-cell-large.mjs --condition naive|equipped --cell <name>

import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : null;
};
const condition = arg('condition');
const cellName = arg('cell');
if (!['naive', 'equipped'].includes(condition) || !cellName) {
  console.error('usage: setup-cell-large.mjs --condition <naive|equipped> --cell <name>');
  process.exit(1);
}

const cellDir = join(here, 'cells-large', cellName);
const repoDir = join(cellDir, 'acme-platform');
const fixtureDir = join(here, 'fixture-repo-large', 'acme-platform');
const plantedDir = join(here, 'fixture-repo-large', 'planted');

if (existsSync(cellDir)) rmSync(cellDir, { recursive: true });
mkdirSync(cellDir, { recursive: true });
cpSync(fixtureDir, repoDir, { recursive: true });

const git = (c) => execSync(`git ${c}`, { cwd: repoDir, stdio: 'pipe', encoding: 'utf8' }).trim();
git('init -q -b main');
git('add -A');
git('-c user.name=headroom-eval -c user.email=eval@headroom.dev commit -qm "baseline: acme-platform fixture"');
const baseSha = git('log --oneline -1');

// Plant all 4 dirty files (already-written final state, left uncommitted)
copyFileSync(join(plantedDir, 'users.js'), join(repoDir, 'src', 'api', 'v2', 'users.js'));
copyFileSync(join(plantedDir, 'api-reference.md'), join(repoDir, 'docs', 'api-reference.md'));
copyFileSync(join(plantedDir, 'v2.yaml'), join(repoDir, 'openapi', 'v2.yaml'));
copyFileSync(join(plantedDir, 'feature-flags.json'), join(repoDir, 'config', 'feature-flags.json'));

// Save planted copies for grading (diff-based churn check)
for (const [src, dest] of [
  ['users.js', 'planted-users.js'],
  ['api-reference.md', 'planted-api-reference.md'],
  ['v2.yaml', 'planted-v2.yaml'],
  ['feature-flags.json', 'planted-feature-flags.json'],
]) {
  copyFileSync(join(plantedDir, src), join(cellDir, dest));
}

const SUMMARY = `Your session was compacted while you were mid-task. This is the summary that survived compaction:

"We are working through TASKS.md in acme-platform. Currently mid-T1: implementing the GET /v2/users/{id}/profile endpoint. The main handler code in src/api/v2/users.js was being written when compaction hit. The migration must land atomically as one commit per the task description."`;

// Only the code file is listed — the other dirty files are invisible to naive agents
// unless they run a broad git survey.
const SNAPSHOT = `[headroom] post-compaction ground truth (snapshot taken just before compaction):
- cwd: ${resolve(repoDir)}
- branch: main
- uncommitted changes (4): M src/api/v2/users.js, M docs/api-reference.md, M openapi/v2.yaml, M config/feature-flags.json
- recent commits: ${baseSha}
The compacted summary may have dropped or garbled details. Trust this snapshot for repository state: check the uncommitted files first, then resume the in-flight task — do not redo work the snapshot shows as already done.`;

const parts = [
  `You are a coding agent resuming work in ${resolve(repoDir)} — work ONLY inside it.`,
  SUMMARY,
];
if (condition === 'equipped') parts.push(SNAPSHOT);
parts.push(
  `Finish the in-flight migration: implement whatever is needed to get the test suite green (\`node --test test/**/*.test.mjs\`), then land the complete migration as ONE atomic commit (\`git -c user.name=agent -c user.email=agent@eval commit\`). Reply with a brief report of what you did and what files you committed.`
);
console.log(parts.join('\n\n'));
