#!/usr/bin/env node
// Release preflight: every check that has actually bitten a release, automated.
// Run by /release (step 1) and by agents before any tag push. Exit 1 on blockers.
//   node scripts/release-preflight.mjs [--offline]   (--offline skips registry/gh checks)
//
// Born 2026-06-10: the first real release run failed at npm publish (E403) after all
// local gates passed — the failure lived in the parts nobody had encoded (token type,
// registry state). This script encodes them.

import { readFileSync } from 'node:fs';
import { execSync, execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const offline = process.argv.includes('--offline');
const sh = (cmd, opts = {}) => execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();

let problems = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m, fix) => {
  problems++;
  console.log(`  ✗ ${m}${fix ? `\n      fix: ${fix}` : ''}`);
};
const info = (m) => console.log(`  - ${m}`);

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
console.log(`release preflight — ${pkg.name}@${version}\n`);

// 1. tree + tests + gates
sh('git status --porcelain') === '' ? ok('working tree clean') : bad('working tree dirty', 'commit or stash before releasing');
try {
  // TOKENROOM_PREFLIGHT lets the suite's own preflight test skip itself (no recursion)
  sh('npm test', { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TOKENROOM_PREFLIGHT: '1' } });
  ok('test suite green');
} catch {
  bad('tests failing', 'fix before releasing');
}
try {
  sh('node scripts/check-invariants.mjs');
  ok('invariant gates OK');
} catch {
  bad('invariant gates failing');
}

// 2. version coherence: CHANGELOG has a DATED section for this version (not Unreleased)
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
new RegExp(`^## ${version.replace(/\./g, '\\.')} — \\d{4}-\\d{2}-\\d{2}`, 'm').test(changelog)
  ? ok(`CHANGELOG has a dated section for ${version}`)
  : bad(`CHANGELOG section "## ${version} — YYYY-MM-DD" missing`, 'date the section — release.yml extracts it for the GitHub release');

// 3. tag state: this version's tag must not already exist UNLESS it points at HEAD
//    (re-running a failed publish is legitimate; re-tagging differently is not)
const tagSha = (() => {
  try {
    return sh(`git rev-parse v${version}^{commit}`);
  } catch {
    return null;
  }
})();
const head = sh('git rev-parse HEAD');
if (!tagSha) ok(`tag v${version} not yet created (will be cut by /release step 4)`);
else if (tagSha === head) info(`tag v${version} already exists at HEAD — a failed publish can be re-run: gh run rerun <id>`);
else bad(`tag v${version} exists but points at a DIFFERENT commit`, 'bump the version instead of moving tags');

// 4. tarball sanity
const packLines = sh('npm pack --dry-run 2>&1');
const files = Number(packLines.match(/total files:\s+(\d+)/)?.[1] ?? 0);
files >= 20 && files <= 40 ? ok(`tarball sane (${files} files)`) : bad(`tarball has ${files} files — expected 20-40`, 'check package.json "files"');
/eval\/|docs\/|launch\/|test\//.test(packLines.replace(/total files.*/s, '')) ? bad('tarball leaks non-shipping dirs') : ok('tarball scoped to bin/src/skill/schema');

if (offline) {
  console.log(`\n${problems ? `${problems} blocker(s)` : 'all offline checks pass'} (registry/CI checks skipped: --offline)`);
  if (problems) process.exitCode = 1;
} else {
  // 5. registry state: is this exact version already published?
  try {
    const published = execFileSync('npm', ['view', pkg.name, 'version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    published === version
      ? bad(`${pkg.name}@${version} is ALREADY on npm`, 'bump the version — npm never allows republishing a version')
      : ok(`registry has ${published}; ${version} is new`);
  } catch {
    ok(`${pkg.name} not yet on the registry — first publish`);
  }
  // 6. CI + secret presence (token TYPE is not remotely checkable — see the runbook note)
  try {
    /NPM_TOKEN/.test(sh('gh secret list')) ? ok('NPM_TOKEN secret exists') : bad('NPM_TOKEN secret missing', 'gh secret set NPM_TOKEN (Automation-type token — see /release)');
  } catch {
    info('gh CLI unavailable — cannot verify repo secret');
  }
  info('NOT checkable from here: token TYPE. CI publish needs a Classic→Automation token (2FA accounts reject publish-type tokens from CI with E403 "may not perform that action"). If the release run fails exactly there, that is the cause.');
  console.log(`\n${problems ? `${problems} blocker(s) found` : 'preflight clean — tag when ready'}`);
  if (problems) process.exitCode = 1;
}
