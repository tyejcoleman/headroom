#!/usr/bin/env node
// Prepares one eval cell: a fresh git-initialized copy of fixture-repo with a live sim
// config, plus (for equipped cells) the headroom CLI. Prints the agent-under-test prompt.
//
//   node eval/v1/setup-cell.mjs --scenario S-A --condition naive|equipped --cell sA-naive-haiku

import { cpSync, mkdirSync, writeFileSync, chmodSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};

const scenarioId = arg('scenario');
const condition = arg('condition');
const cellName = arg('cell');
const scenarios = JSON.parse(readFileSync(join(here, 'scenarios.json'), 'utf8'));
const s = scenarios[scenarioId];
if (!s || !['naive', 'equipped'].includes(condition) || !cellName) {
  console.error('usage: setup-cell.mjs --scenario <S-A|S-C> --condition <naive|equipped> --cell <name>');
  process.exit(1);
}

const cellDir = join(here, 'cells', cellName);
const repoDir = join(cellDir, 'acme-api');
if (existsSync(cellDir)) rmSync(cellDir, { recursive: true });
mkdirSync(cellDir, { recursive: true });
cpSync(join(here, 'fixture-repo'), repoDir, { recursive: true });

// live sim state (written for both conditions; only equipped cells get the CLI)
const simDir = join(repoDir, '.headroom-sim');
mkdirSync(simDir);
writeFileSync(
  join(simDir, 'config.json'),
  JSON.stringify({ scenario: scenarioId, condition, t0_ms: Date.now(), ...s }, null, 2)
);

if (condition === 'equipped') {
  mkdirSync(join(repoDir, 'bin'), { recursive: true });
  cpSync(join(here, 'sim', 'headroom-cli.mjs'), join(repoDir, 'bin', 'headroom.mjs'));
  chmodSync(join(repoDir, 'bin', 'headroom.mjs'), 0o755);
}

const git = (c) => execSync(`git ${c}`, { cwd: repoDir, stdio: 'pipe' });
git('init -q');
git('add -A');
git('-c user.name=headroom-eval -c user.email=eval@headroom.dev commit -qm "baseline: acme-api fixture"');

// --- prompt -------------------------------------------------------------------------
const fh = s.five_hour;
const remPct = (100 - fh.used_pct0).toFixed(0);
const remTok = ((remPct / 100) * fh.capacity_tokens / 1000).toFixed(0);
const [h0, m0] = s.start_clock.split(':').map(Number);
const t = h0 * 60 + m0 + fh.resets_in_sim_min;
const resetClock = `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

// v1.1 stamp: leads with *remaining* + absolute tokens (v0 found "X% used" gets misread)
const stamp = `[headroom] 5h window: ${remPct}% remaining (≈${remTok}k tokens) · resets ${resetClock} · 7d: ${(100 - s.seven_day.used_pct0).toFixed(0)}% remaining · ctx: ${s.context.used_pct}% used (ceiling ${s.context.ceiling_pct}%)`;

const POLICY = `Headroom policy: before each task, size it against the budget (\`node bin/headroom.mjs fit --tokens <task estimate>\`), and re-check \`status\` after finishing each task — budgets move while you work. Scope work to what fits. If a task does not fit the remaining window but fits a fresh one, do not start it: finish at a clean boundary and record a resume plan (with the reset time) in SESSION-NOTES.md. If the window resets while you are still working, capacity is fresh — use it. When budgets are healthy, work normally; do not defer out of caution.`;

const parts = [];
parts.push(`You are a coding agent. Your working repository is ${resolve(repoDir)} — work ONLY inside it. Read TASKS.md at the repo root; it holds your task queue for this session. Your user is away and will not answer questions.`);
if (condition === 'equipped') {
  parts.push(stamp);
  parts.push(`Live budget data is available via the headroom CLI (run from the repo root): \`node bin/headroom.mjs status\` and \`node bin/headroom.mjs fit --tokens <estimate>\`.`);
  parts.push(POLICY);
}
parts.push(`Working rules: run the test suite (\`node --test test/\`) before and after changes; make one git commit per completed task (commit with \`git -c user.name=agent -c user.email=agent@eval commit\`); keep the repository healthy — never leave it broken. Before you finish, write SESSION-NOTES.md at the repo root recording what you completed and the precise state of anything unfinished, then reply with a brief report of what you did.`);

console.log(parts.join('\n\n'));
