#!/usr/bin/env node
// G2-sim: post-compaction continuity. Plants a half-done auth migration (token.js
// rewritten but uncommitted; middleware/tests untouched; suite red), then prints the
// agent prompt: a deliberately LOSSY compaction summary, plus — in the equipped
// condition — the exact ground-truth block headroom's SessionStart hook re-injects.
//
//   node eval/v2-continuity/setup-cell.mjs --condition naive|equipped --cell <name>

import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, copyFileSync } from 'node:fs';
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
  console.error('usage: setup-cell.mjs --condition <naive|equipped> --cell <name>');
  process.exit(1);
}

const cellDir = join(here, 'cells', cellName);
const repoDir = join(cellDir, 'acme-api');
if (existsSync(cellDir)) rmSync(cellDir, { recursive: true });
mkdirSync(cellDir, { recursive: true });
cpSync(join(here, '..', 'v1', 'fixture-repo'), repoDir, { recursive: true });

const git = (c) => execSync(`git ${c}`, { cwd: repoDir, stdio: 'pipe', encoding: 'utf8' }).trim();
git('init -q -b main');
git('add -A');
git('-c user.name=headroom-eval -c user.email=eval@headroom.dev commit -qm "baseline: acme-api fixture"');
const baseSha = git('log --oneline -1');

// the half-done migration: token.js fully rewritten per the RFC, left uncommitted
const PLANTED = `import { createHmac } from 'node:crypto';

const SECRET = process.env.ACME_SECRET ?? 'dev-secret';
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sign = (payload) => b64u(createHmac('sha256', SECRET).update(payload).digest());

export function createSessionToken(userId, ttlSeconds) {
  const payload = JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  return \`st_\${b64u(payload)}.\${sign(payload)}\`;
}

export function validateSessionToken(token) {
  if (typeof token !== 'string' || !token.startsWith('st_')) return null;
  const [p, sig] = token.slice(3).split('.');
  if (!p || !sig) return null;
  let payload;
  try {
    payload = Buffer.from(p, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (sign(payload) !== sig) return null;
  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof data.exp !== 'number' || data.exp <= Math.floor(Date.now() / 1000)) return null;
  return { userId: data.sub };
}
`;
writeFileSync(join(repoDir, 'src', 'auth', 'token.js'), PLANTED);
copyFileSync(join(repoDir, 'src', 'auth', 'token.js'), join(cellDir, 'planted-token.js'));

const SUMMARY = `Your session was compacted while you were mid-task. This is the summary that survived compaction:

"We are working through TASKS.md in acme-api. Currently mid-T1: migrating auth from API keys to signed session tokens per docs/rfc-session-tokens.md. Some of the migration was already applied before compaction — parts of the auth layer are done, others are not — and the test suite was failing when compaction hit. The migration must land atomically as one commit."`;

const SNAPSHOT = `[headroom] post-compaction ground truth (snapshot taken just before compaction):
- cwd: ${resolve(repoDir)}
- branch: main
- uncommitted changes (1):  M src/auth/token.js
- recent commits: ${baseSha}
The compacted summary may have dropped or garbled details. Trust this snapshot for repository state: check the uncommitted files first, then resume the in-flight task — do not redo work the snapshot shows as already done.`;

const parts = [
  `You are a coding agent resuming work in ${resolve(repoDir)} — work ONLY inside it.`,
  SUMMARY,
];
if (condition === 'equipped') parts.push(SNAPSHOT);
parts.push(
  `Finish the in-flight migration: implement the RFC fully, get the suite green (\`node --test test/\`), and land it as ONE commit (\`git -c user.name=agent -c user.email=agent@eval commit\`). Reply with a brief report of what you did.`
);
console.log(parts.join('\n\n'));
