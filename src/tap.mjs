import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tokenroomDir, ensureDir, accountKey, accountDir, accountForSession, recordSessionAccount, gcAccounts, crossedReset, sameSevenDayPhase } from './util.mjs';
import { parsePayload, updateBurn, writeState, readState, enrichWeekly } from './state.mjs';
import { renderHUD } from './hud.mjs';
import { readResume } from './resume.mjs';
import { detectContextDrop, logEvent } from './events.mjs';
import { enrichBurn } from './flow.mjs';
import { updateProfileSnapshot, bestOther, profileForKey, foldKey } from './accounts.mjs';

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
    // INSTANT switch detection (ADR-24): the payload is ground truth for which account this
    // session is on NOW. A render whose key differs from the session's existing mapping
    // means the user /login-switched — remap in this same invocation (payload wins, always)
    // and log it so the next stamp announces the switch instead of quoting the OLD account.
    const prevKey = key && fresh.session_id ? accountForSession(fresh.session_id, now) : null;
    if (key) {
      ensureDir(dir);
      recordSessionAccount(fresh.session_id, key, now); // so hooks (no rate_limits) find us
      if (prevKey && prevKey !== key) {
        // ROLLOVER vs /login SWITCH (ADR-24): an idle account starts its NEXT 5h window at a
        // new phase → a new account key for the SAME physical account. That is not a switch.
        // Classify against the previous bucket: if its 5h window has ALREADY reset AND the new
        // payload's weekly phase matches the previous bucket's, this is a same-account window
        // rollover — don't cry "account switched" (a false banner), and let any profile label
        // follow the account across phases (auto-fold). A genuine /login still fires because
        // the old window had not yet reset (you left a live account) or the 7d phase differs.
        const prevState = readState(accountDir(prevKey));
        const rolledOver =
          !!crossedReset(prevState, now) &&
          sameSevenDayPhase(prevState?.windows?.seven_day?.resets_at, fresh.windows?.seven_day?.resets_at);
        if (rolledOver) {
          logEvent({ type: 'account_rollover', session_id: fresh.session_id ?? null, from: prevKey, to: key }, now);
          const label = profileForKey(prevKey);
          if (label) foldKey(key, label, now); // the label follows the account to its new bucket
        } else {
          logEvent({ type: 'account_switch', session_id: fresh.session_id ?? null, from: prevKey, to: key }, now);
        }
      }
    }
    fresh.account_key = key;
    const prev = readState(dir);
    // ECHO HONESTY (ADR-24): after /login the payload keeps echoing the OLD account's
    // cached rate_limits until a turn completes, and every render re-stamps that echo as
    // fresh. Track when the window VALUES last actually moved, so the hook can stop
    // asserting a frozen dry figure while a fresher sibling account exists.
    const winJSON = (w) => JSON.stringify([w?.five_hour?.used_pct ?? null, w?.five_hour?.resets_at ?? null, w?.seven_day?.used_pct ?? null, w?.seven_day?.resets_at ?? null]);
    fresh.values_changed_at = prev && winJSON(prev.windows) === winJSON(fresh.windows) ? prev.values_changed_at ?? prev.updated_at : fresh.updated_at;
    const state = enrichWeekly(enrichBurn(updateBurn(fresh, dir), now, dir), now);
    detectContextDrop(prev, state); // silent microcompaction leaves no other trace
    writeState(state, dir);
    // Top-level pointer = the most-recently-active account, for the human CLIs (watch/line/
    // doctor/mcp) that have no session context. The agent-facing hook reads per-account.
    if (key) {
      writeState(state, tokenroomDir());
      updateProfileSnapshot(key, state.windows, now); // labeled profiles keep a fresh snapshot
    }
    gcAccounts(now);
    hud = renderHUD(state, readResume(), now, key ? bestOther(key, now) : null);
  } catch {
    // malformed/missing payload: keep the line, skip the write
  }
  process.stdout.write(hud);
}
