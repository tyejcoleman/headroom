#!/usr/bin/env node
// Hard gates for the shipped package (src/ + bin/). Runs three ways:
//   1. Repo .claude/settings.json PostToolUse hook — blocks an agent's edit on the spot
//      (exit 2 feeds stderr back to the model as a correction).
//   2. test/invariants.test.mjs — so `npm test` and CI enforce the same gates.
//   3. Manually: node scripts/check-invariants.mjs
// Each gate cites the ADR it enforces (docs/DECISIONS.md). Keep this FAST (<100ms);
// it runs after every file edit an agent makes.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const errors = [];

// G1 — zero-dependency package (ADR-2)
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const key of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
  if (pkg[key] && Object.keys(pkg[key]).length) {
    errors.push(`G1 zero-dep: package.json declares ${key} — the shipped package is zero-dependency by decision (ADR-2). Solve it with node: builtins or push back in an issue.`);
  }
}

// source files of the shipped package only (eval/ and scripts/ are exempt)
const files = [];
for (const dir of ['src', 'bin']) {
  for (const f of readdirSync(join(root, dir))) {
    if (f.endsWith('.mjs')) files.push(join(root, dir, f));
  }
}

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const rel = file.slice(root.length + 1);

  // G2 — imports must be node: builtins or relative (ADR-2, enforced at the source)
  for (const m of text.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    if (!spec.startsWith('node:') && !spec.startsWith('.')) {
      errors.push(`G2 imports: ${rel} imports "${spec}" — only node: builtins or relative paths (ADR-2).`);
    }
  }

  // G3 — no network, ever (ADR-1: local files and official harness surfaces only)
  for (const marker of ['node:http', 'node:https', 'node:net', 'node:tls', 'node:dns', 'fetch(']) {
    if (text.includes(marker)) {
      errors.push(`G3 no-network: ${rel} contains "${marker}" — the package must never touch the network (ADR-1).`);
    }
  }

  // G4 — compliance tripwires (ADR-1: no credential reuse, no undocumented endpoints)
  for (const marker of ['credentials.json', 'oauth', 'api.anthropic.com']) {
    if (text.toLowerCase().includes(marker)) {
      errors.push(`G4 compliance: ${rel} references "${marker}" — forbidden surface (ADR-1). If this is a comment, rephrase it; tripwires are deliberately blunt.`);
    }
  }

  // G5 — collectors and hooks must never throw to the harness (ADR-5)
  if (/^(src\/tap|src\/hook)/.test(rel) && !text.includes('catch')) {
    errors.push(`G5 never-crash: ${rel} has no catch blocks — statusline/hook entry points must degrade, never throw (ADR-5).`);
  }
}

if (errors.length) {
  console.error('headroom invariant gates FAILED:\n' + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(2);
}
console.log(`invariant gates: OK (${files.length} files checked)`);
