#!/usr/bin/env node
// Spike S0 — confirm the load-bearing data exists.
//
// Throwaway statusline command. It captures the RAW stdin JSON Claude Code feeds to the
// statusline and appends it to ~/.headroom/raw-sample.json so we can verify, on a real
// account, that `rate_limits` and `context_window` actually arrive (assumption A1 in
// docs/VALIDATION.md). It must never crash the statusline — degrade, always print a line.
//
// Register temporarily, e.g. in ~/.claude/settings.json:
//   "statusLine": { "type": "command",
//     "command": "node /Users/taikicoleman/Development/headroom/spikes/s0-dump-statusline.mjs" }
// Then use Claude Code normally for a few prompts and inspect:
//   tail -3 ~/.headroom/raw-sample.json

import { mkdirSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  const dir = join(homedir(), '.headroom');
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'raw-sample.json'), raw.trim() + '\n');
  } catch {
    // Capture is best-effort; never let it break the statusline.
  }

  let hud = 'headroom S0 · captured';
  try {
    const j = JSON.parse(raw);
    const rl = j.rate_limits ? 'rate_limits:YES' : 'rate_limits:absent';
    const cw = j.context_window ? 'context_window:YES' : 'context_window:absent';
    let pct = '';
    const u = j.context_window?.used_percentage;
    if (typeof u === 'number') pct = ` · ctx ${u.toFixed(0)}%`;
    hud = `headroom S0 · ${rl} · ${cw}${pct}`;
  } catch {
    hud = 'headroom S0 · captured (stdin not valid JSON)';
  }
  process.stdout.write(hud);
});
