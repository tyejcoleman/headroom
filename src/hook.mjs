import { readState } from './state.mjs';
import { readConfig, fmtClock, fmtTokens } from './util.mjs';
import { captureHandoff, takeHandoff, renderHandoff } from './handoff.mjs';
import { readResume } from './resume.mjs';
import { logEvent, recentEvents } from './events.mjs';
import { listPins, renderPins } from './pins.mjs';

const STALE_SEC = 30 * 60;

async function readStdin() {
  let raw = '';
  try {
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) raw += chunk;
  } catch {
    // best-effort
  }
  try {
    return JSON.parse(raw) ?? {};
  } catch {
    return {};
  }
}

/** PreCompact: snapshot ground-truth repo state so it survives the compaction.
 *  With compact_guard_min set, may block AUTO compaction near a window reset (ADR-13). */
export async function hookPreCompact() {
  const p = await readStdin();
  try {
    const guardMin = readConfig().compact_guard_min;
    if (typeof guardMin === 'number' && guardMin > 0 && p.trigger === 'auto') {
      const resets = readState()?.windows?.five_hour?.resets_at;
      const left = resets ? resets - Date.now() / 1000 : null;
      if (left !== null && left > 0 && left <= guardMin * 60) {
        logEvent({ type: 'compact_blocked', session_id: p.session_id ?? null, minutes_to_reset: Math.round(left / 60) });
        process.stdout.write(
          JSON.stringify({
            decision: 'block',
            reason: `headroom compact guard: the 5h window resets in ${Math.round(left / 60)}m — after the reset, /clear gives fresh context AND a fresh window, which beats compacting now. Run /compact to compact anyway, or unset compact_guard_min in ~/.headroom/config.json.`,
          })
        );
        return;
      }
    }
    captureHandoff({
      session_id: p.session_id,
      cwd: p.cwd,
      trigger: p.trigger,
      transcript_path: p.transcript_path,
      custom_instructions: p.custom_instructions,
    });
    logEvent({ type: 'pre_compact', session_id: p.session_id ?? null, trigger: p.trigger ?? null });
  } catch {
    // a failed snapshot (or guard) must never break compaction itself — fail open
  }
}

/** PostCompact: record that a compaction completed (observability, ADR-13/T2.9). */
export async function hookPostCompact() {
  const p = await readStdin();
  try {
    logEvent({ type: 'post_compact', session_id: p.session_id ?? null, trigger: p.trigger ?? null });
  } catch {
    // best-effort
  }
}

/** SessionStart: re-inject the handoff + pins after compaction; flag ready deferred work. */
export async function hookSessionStart() {
  const p = await readStdin();
  logEvent({ type: 'session_start', session_id: p.session_id ?? null, source: p.source ?? null });
  const parts = [];
  if (p.source === 'compact') {
    const snap = takeHandoff(p.session_id);
    if (snap) parts.push(renderHandoff(snap));
    const pins = listPins();
    if (pins.length) parts.push(renderPins(pins));
  }
  const plan = readResume();
  if (plan?.resume_at && Date.now() / 1000 >= plan.resume_at) {
    parts.push(
      `[headroom] deferred work is now ready (its window has reset): "${plan.summary}". Surface this to the user, and run \`headroom resume --clear\` once it is picked up.`
    );
  }
  if (!parts.length) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: parts.join('\n\n') },
    })
  );
}

/**
 * UserPromptSubmit hook: emit a tiny headroom stamp as additionalContext.
 * Wording rule (validated in eval v0/v1): always REMAINING-first, with absolute
 * tokens where known. Silent when disabled, missing, or stale — never inject a lie.
 */
export async function hookUserPromptSubmit() {
  const payload = await readStdin();
  const mySession = payload.session_id ?? null;

  if (process.env.HEADROOM_DISABLE === '1' || !readConfig().stamp_enabled) return;
  const s = readState();
  if (!s || Date.now() / 1000 - s.updated_at > STALE_SEC) return;

  // Rate-limit windows are account-level (true for every session). Context is
  // session-level: when state.json was last written by a DIFFERENT concurrent session,
  // its context would be a lie here — omit it.
  const foreign = mySession && s.session_id && mySession !== s.session_id;

  const parts = [];
  const fh = s.windows?.five_hour;
  const sd = s.windows?.seven_day;
  const ctx = foreign ? null : s.context;
  if (fh?.used_pct != null) {
    let seg = `5h: ${Math.round(100 - fh.used_pct)}% left${fh.resets_at ? `, resets ${fmtClock(fh.resets_at)}` : ''}`;
    const exh = s.burn?.projected_exhaustion;
    if (exh && fh.resets_at && exh < fh.resets_at) seg += ` (at current burn, may exhaust ~${fmtClock(exh)})`;
    parts.push(seg);
  }
  if (sd?.used_pct != null) parts.push(`7d: ${Math.round(100 - sd.used_pct)}% left`);
  if (ctx?.tokens_to_ceiling != null) {
    parts.push(`ctx: ~${fmtTokens(ctx.tokens_to_ceiling)} tokens before compaction`);
  } else if (ctx?.used_pct != null) {
    parts.push(`ctx: ${Math.max(0, Math.round((ctx.compact_ceiling_pct ?? 80) - ctx.used_pct))}% left before compaction`);
  }
  const plan = readResume();
  if (plan?.resume_at && Date.now() / 1000 >= plan.resume_at) {
    parts.push(`deferred work now ready: "${plan.summary.slice(0, 60)}"`);
  }

  // Microcompaction is silent (no hook fires) — if the tap saw an unexplained context
  // cliff for this session, disclose it once, with the recovery path.
  const drops = recentEvents(10 * 60).filter((e) => e.type === 'context_drop' && (!mySession || e.session_id === mySession));
  const drop = drops[drops.length - 1];
  if (drop && !recentEvents(10 * 60).some((e) => e.type === 'drop_announced' && e.ref === drop.at)) {
    let note = `note: context shrank ~${drop.dropped_tokens ? `${fmtTokens(drop.dropped_tokens)} tokens` : `${drop.dropped_pct}%`} without a compaction (upstream trimming of old tool results)`;
    if (typeof payload.transcript_path === 'string') note += `; exact history survives at ${payload.transcript_path}`;
    parts.push(note);
    logEvent({ type: 'drop_announced', ref: drop.at });
  }

  if (!parts.length) return;

  // Fresh and 25-minutes-old look identical otherwise; disclose age once it's not "now".
  const ageSec = Date.now() / 1000 - s.updated_at;
  const ageMark = ageSec > 120 ? ` (${Math.round(ageSec / 60)}m old)` : '';

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `[headroom] ${parts.join(' · ')}${ageMark}`,
      },
    })
  );
}
