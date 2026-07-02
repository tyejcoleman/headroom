import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync, readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureDir, atomicWrite } from '../src/util.mjs';

// State can carry verbatim user messages (extracts, continuity, handoffs) — on
// multi-user machines the state tree must be owner-only. The dir barrier (0700) is
// the load-bearing control; 0600 on atomic writes is defense-in-depth.
const mode = (p) => statSync(p).mode & 0o777;
const skip = process.platform === 'win32' ? 'POSIX modes are not meaningful on Windows' : false;

test('ensureDir creates owner-only dirs and converges pre-existing loose ones', { skip }, () => {
  const base = mkdtempSync(join(tmpdir(), 'tr-perms-'));
  const fresh = join(base, 'fresh');
  ensureDir(fresh);
  assert.equal(mode(fresh), 0o700);

  const loose = join(base, 'loose');
  mkdirSync(loose, { mode: 0o755 });
  ensureDir(loose); // pre-hardening dirs get chmod'd on the next touch
  assert.equal(mode(loose), 0o700);
});

test('atomicWrite lands files as 0600 and rename preserves content', { skip }, () => {
  const base = mkdtempSync(join(tmpdir(), 'tr-perms-'));
  const file = join(base, 'state.json');
  atomicWrite(file, '{"ok":true}');
  assert.equal(mode(file), 0o600);
  assert.equal(readFileSync(file, 'utf8'), '{"ok":true}');
});
