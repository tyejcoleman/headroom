import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('invariant gates pass on the shipped package', () => {
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'check-invariants.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /invariant gates: OK/);
});

test('installer refuses ephemeral (npx-cache) package locations', async () => {
  const { isEphemeralInstall } = await import('../src/install.mjs');
  assert.equal(isEphemeralInstall('/Users/x/.npm/_npx/abc123/node_modules/tokenroom'), true);
  assert.equal(isEphemeralInstall('C:\\Users\\x\\AppData\\npm-cache\\_npx\\ab\\node_modules\\tokenroom'), true);
  assert.equal(isEphemeralInstall('/usr/local/lib/node_modules/tokenroom'), false);
  assert.equal(isEphemeralInstall('/Users/x/Development/tokenroom'), false);
});
