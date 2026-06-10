#!/usr/bin/env node
// Simulated `headroom` CLI — installed into a cell repo as bin/headroom.mjs.
//
// Stands in for the real MCP tools (`resource_state`, `fit_check`) during evals. Budget
// state is *live*: it burns down with (accelerated) wall-clock time from the cell's
// .headroom-sim/config.json, and windows reset on schedule. Every invocation is appended
// to .headroom-sim/journal.jsonl so grading can see when and how the agent consulted it.
//
//   node bin/headroom.mjs status
//   node bin/headroom.mjs fit --tokens <est> [--calls <est>]

import { readFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const simDir = join(root, '.headroom-sim');
const cfg = JSON.parse(readFileSync(join(simDir, 'config.json'), 'utf8'));

// --- simulated clock ---------------------------------------------------------------
const simMin = ((Date.now() - cfg.t0_ms) / 60000) * cfg.accel;
const [h0, m0] = cfg.start_clock.split(':').map(Number);
const clockAt = (min) => {
  const t = h0 * 60 + m0 + Math.round(min);
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

// --- five-hour window state at simMin ------------------------------------------------
const fh = cfg.five_hour;
let resetIn = fh.resets_in_sim_min - simMin;
let used = fh.used_pct0 + fh.burn_pct_per_sim_hour * (simMin / 60);
let nextResetMin = fh.resets_in_sim_min;
while (resetIn <= 0) {
  used = fh.post_reset_base_pct + fh.burn_pct_per_sim_hour * (-resetIn / 60);
  resetIn += 300;
  nextResetMin += 300;
}
used = Math.min(100, Math.max(0, used));
const remainingPct = 100 - used;
const remainingTokens = Math.round((remainingPct / 100) * fh.capacity_tokens);
const exhausted = used >= 100;

const statusLines = [
  `[headroom] sim-time ${clockAt(simMin)} · scenario ${cfg.scenario}`,
  `5h window: ${remainingPct.toFixed(1)}% remaining (≈${(remainingTokens / 1000).toFixed(1)}k tokens) · resets ${clockAt(nextResetMin)} (${Math.round(resetIn)} min)`,
  `7d window: ${(100 - cfg.seven_day.used_pct0).toFixed(0)}% remaining`,
  `context: ${cfg.context.used_pct}% used (compact ceiling ${cfg.context.ceiling_pct}%)`,
  exhausted ? 'WARNING: 5h window EXHAUSTED — further work hits 429s until the reset.' : null,
].filter(Boolean);

// --- commands ------------------------------------------------------------------------
const [cmd, ...rest] = process.argv.slice(2);
const arg = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? Number(rest[i + 1]) : null;
};

let out;
if (cmd === 'status') {
  out = statusLines.join('\n');
} else if (cmd === 'fit') {
  const est = arg('tokens');
  if (!Number.isFinite(est) || est <= 0) {
    out = 'usage: headroom fit --tokens <estimate> [--calls <estimate>]';
  } else if (exhausted) {
    out = `fit_check(${est}): DEFER — window exhausted; resets ${clockAt(nextResetMin)}.`;
  } else if (est <= remainingTokens * 0.7) {
    out = `fit_check(${est}): FITS — ≈${(remainingTokens / 1000).toFixed(1)}k tokens remaining in the 5h window.`;
  } else if (est <= remainingTokens) {
    out = `fit_check(${est}): TIGHT — ≈${(remainingTokens / 1000).toFixed(1)}k remaining; finish at a clean boundary, no scope growth.`;
  } else if (est <= fh.capacity_tokens * 0.9) {
    out = `fit_check(${est}): DEFER — exceeds ≈${(remainingTokens / 1000).toFixed(1)}k remaining; fits a fresh window after the ${clockAt(nextResetMin)} reset. Split only if a ≤${(remainingTokens / 1000).toFixed(1)}k slice ships independently.`;
  } else {
    out = `fit_check(${est}): SPLIT — larger than a full window (${(fh.capacity_tokens / 1000).toFixed(0)}k); break it into window-sized pieces.`;
  }
} else {
  out = 'usage: headroom <status | fit --tokens N [--calls N]>';
}

try {
  appendFileSync(
    join(simDir, 'journal.jsonl'),
    JSON.stringify({ at: new Date().toISOString(), sim_min: Math.round(simMin * 10) / 10, sim_clock: clockAt(simMin), cmd, args: rest, used_pct: Math.round(used * 10) / 10, exhausted }) + '\n'
  );
} catch {
  // journaling is best-effort
}

console.log(out);
