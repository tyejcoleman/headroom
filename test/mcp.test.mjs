import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bin = join(root, 'bin', 'headroom.mjs');

test('mcp: initialize → tools/list → fit_check round-trip', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'headroom-mcp-'));
  spawnSync(process.execPath, [bin, 'tap'], {
    input: readFileSync(join(root, 'test', 'fixtures', 'statusline-full.json'), 'utf8'),
    env: { ...process.env, HEADROOM_DIR: dir },
  });

  const child = spawn(process.execPath, [bin, 'mcp'], { env: { ...process.env, HEADROOM_DIR: dir } });
  const lines = createInterface({ input: child.stdout });
  const pending = [];
  const waiters = [];
  lines.on('line', (l) => {
    const w = waiters.shift();
    if (w) w(JSON.parse(l));
    else pending.push(JSON.parse(l));
  });
  const next = () =>
    new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('mcp response timeout')), 5000);
      const done = (v) => { clearTimeout(t); res(v); };
      if (pending.length) done(pending.shift());
      else waiters.push(done);
    });
  const send = (m) => child.stdin.write(JSON.stringify(m) + '\n');

  try {
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } });
    const init = await next();
    assert.equal(init.result.serverInfo.name, 'headroom');

    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const list = await next();
    assert.deepEqual(list.result.tools.map((t) => t.name).sort(), ['estimate_remaining', 'fit_check', 'plan_resume', 'resource_state']);

    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'fit_check', arguments: { est_tokens: 5000 } } });
    const fit = await next();
    const result = JSON.parse(fit.result.content[0].text);
    assert.equal(result.overall, 'fits');
    assert.equal(result.window.pct_left, 57.5);

    send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'resource_state', arguments: {} } });
    const state = await next();
    assert.equal(JSON.parse(state.result.content[0].text).schema, 'resource-state/v0');

    send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'plan_resume', arguments: { summary: 'resume the big refactor', est_tokens: 30000 } } });
    const planned = JSON.parse((await next()).result.content[0].text);
    assert.equal(planned.recorded, true);
    assert.equal(typeof planned.resume_at_clock, 'string');
  } finally {
    child.kill();
  }
});
