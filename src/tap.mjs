import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tokenroomDir, ensureDir, accountKey, accountDir, recordSessionAccount, gcAccounts } from './util.mjs';
import { parsePayload, updateBurn, writeState, readState, enrichWeekly } from './state.mjs';
import { renderHUD } from './hud.mjs';
import { readResume } from './resume.mjs';
import { detectContextDrop } from './events.mjs';
import { enrichBurn } from './flow.mjs';

/**
 * Statusline command: read the payload Claude Code pipes to stdin, persist
 * ResourceState atomically, print the HUD. Must NEVER crash or print nothing —
 * a broken statusline is worse than no statusline.
 */
export async function tap(argv = []) {
  let raw = '';
  try {
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) raw += chunk;
  } catch {
    // fall through with whatever we have
  }

  let hud = '⛶ tokenroom: no data';
  try {
    if (argv.includes('--capture')) {
      ensureDir(tokenroomDir());
      appendFileSync(join(tokenroomDir(), 'raw-sample.jsonl'), raw.trim() + '\n');
    }
    const payload = JSON.parse(raw);
    const fresh = parsePayload(payload);
    // Per-account isolation (ADR-21): the payload carries no account id, so concurrent
    // sessions on DIFFERENT accounts would clobber one global state.json (last-writer-wins)
    // and the agent would see another account's quota. Route this account's state/burn/flow
    // into its own subtree, keyed on the windows' reset phase. Null key (api-key / no
    // windows) keeps the legacy global layout.
    const now = Date.now() / 1000;
    const key = accountKey(fresh.windows);
    const dir = accountDir(key);
    if (key) {
      ensureDir(dir);
      recordSessionAccount(fresh.session_id, key, now); // so hooks (no rate_limits) find us
    }
    fresh.account_key = key;
    const prev = readState(dir);
    const state = enrichWeekly(enrichBurn(updateBurn(fresh, dir), now, dir), now);
    detectContextDrop(prev, state); // silent microcompaction leaves no other trace
    writeState(state, dir);
    // Top-level pointer = the most-recently-active account, for the human CLIs (watch/line/
    // doctor/mcp) that have no session context. The agent-facing hook reads per-account.
    if (key) writeState(state, tokenroomDir());
    gcAccounts(now);
    hud = renderHUD(state, readResume());
  } catch {
    // malformed/missing payload: keep the line, skip the write
  }
  process.stdout.write(hud);
}
