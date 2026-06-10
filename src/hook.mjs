import { join } from 'node:path';
import { readState } from './state.mjs';
import { readConfig, modeProfile, fmtClock, fmtTokens, headroomDir, readJSON, atomicWriteJSON, ensureDir } from './util.mjs';
import { captureHandoff, takeHandoff, renderHandoff } from './handoff.mjs';
import { readResume } from './resume.mjs';
import { logEvent, recentEvents } from './events.mjs';
import { listPins, renderPins } from './pins.mjs';
import { takeCheckpoint, renderCheckpoint } from './checkpoint.mjs';
import { sampleFlow } from './flow.mjs';

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

// Mid-turn awareness (T2.11/ADR-14): stamps fire only at UserPromptSubmit, so a long
// autonomous turn burns blind while state.json stays fresh on disk. PostToolUse
// re-stamps ONLY when a budget crosses a WORSENING band — first sight silent (the
// turn-start stamp covered it), improvements silent, throttled between re-stamps.
// Band thresholds, receipt floors, and the throttle come from the governor profile
// (T2.4): the mode shifts when headroom speaks, never what it says.
const bandOf = (left, bands) => bands.filter((t) => left <= t).length;

export async function hookPostToolUse() {
  const p = await readStdin();
  try {
    sampleFlow(p.transcript_path, p.session_id); // velocity engine's FAST signal (T2.1)
    const cfg = readConfig();
    if (process.env.HEADROOM_DISABLE === '1' || !cfg.stamp_enabled) return;
    const prof = modeProfile(cfg.mode);
    const s = readState();
    const now = Date.now() / 1000;
    if (!s || now - s.updated_at > 5 * 60) return;
    const mySession = p.session_id ?? 'unknown';

    const fhLeft = s.windows?.five_hour?.used_pct != null ? 100 - s.windows.five_hour.used_pct : null;
    const fhBand = fhLeft != null ? bandOf(fhLeft, prof.fh_bands) : 0;
    // context is session-scoped (ADR-7): ignore another session's numbers
    const foreign = s.session_id && p.session_id && s.session_id !== p.session_id;
    const ctx = foreign ? null : s.context;
    const ctxLeft = ctx?.used_pct != null ? Math.max(0, (ctx.compact_ceiling_pct ?? 80) - ctx.used_pct) : null;
    const ctxBand = ctxLeft != null ? bandOf(ctxLeft, prof.ctx_bands) : 0;
    const exh = !!(s.burn?.projected_exhaustion && s.windows?.five_hour?.resets_at && s.burn.projected_exhaustion < s.windows.five_hour.resets_at);

    const bandsPath = join(headroomDir(), 'bands.json');
    const all = readJSON(bandsPath) ?? {};
    for (const k of Object.keys(all)) if (now - (all[k].t ?? 0) > 24 * 3600) delete all[k];
    const prev = all[mySession];
    const fhUsed = s.windows?.five_hour?.used_pct ?? null;
    const cost = !foreign && typeof s.session?.cost_usd === 'number' ? s.session.cost_usd : null;
    const save = (entry) => {
      all[mySession] = { ...entry, u: fhUsed, c: cost, t: now };
      ensureDir(headroomDir());
      atomicWriteJSON(bandsPath, all);
    };
    if (!prev) return save({ fh: fhBand, ctx: ctxBand, exh, at: 0 });

    // Cost receipt (T2.13): a single tool call that visibly moved the budget gets a
    // one-line receipt — per-action unit economics, not just a balance. Floors keep it
    // rare; window % is account-level, so a concurrent session's burn can co-attribute
    // (acceptable at a ≥2-point floor; exact attribution lands with T2.1 flow).
    const receipts = [];
    const du = fhUsed != null && prev.u != null ? fhUsed - prev.u : null;
    const dc = cost != null && prev.c != null ? cost - prev.c : null;
    if ((du != null && du >= prof.receipt_pct_floor) || (dc != null && dc >= prof.receipt_cost_floor)) {
      let r = `receipt: that ${p.tool_name ?? 'operation'} cost ≈`;
      r += du != null && du >= prof.receipt_pct_floor ? `${Math.round(du)}% of the 5h window` : `$${dc.toFixed(2)}`;
      if (du != null && du >= prof.receipt_pct_floor && dc != null && dc >= 0.01) r += ` (+$${dc.toFixed(2)})`;
      if (fhLeft != null) r += ` — ${Math.round(fhLeft)}% left`;
      receipts.push(r);
      logEvent({ type: 'receipt', session_id: p.session_id ?? null, tool: p.tool_name ?? null, dpct: du != null ? Math.round(du * 10) / 10 : null, dcost: dc != null ? Math.round(dc * 100) / 100 : null });
    }

    const emit = (lines) =>
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `[headroom] mid-task update: ${lines.join(' · ')}` },
        })
      );

    const worsened = fhBand > prev.fh || ctxBand > prev.ctx || (exh && !prev.exh);
    const throttled = now - (prev.at ?? 0) < prof.throttle_sec;
    if (throttled) {
      if (worsened) logEvent({ type: 'band_change', session_id: p.session_id ?? null, held: true, fh_left: fhLeft != null ? Math.round(fhLeft) : null });
      // record improvements so a later re-worsening re-triggers; hold worsenings for retry
      save({ fh: Math.min(prev.fh, fhBand), ctx: Math.min(prev.ctx, ctxBand), exh: prev.exh && exh, at: prev.at });
      if (receipts.length) emit(receipts); // receipts have their own floor, not the band throttle
      return;
    }

    const parts = [];
    if (fhLeft != null && fhBand > prev.fh) {
      // advice keyed to the absolute level, not the band index — bands vary by mode
      const advice = fhLeft <= 5 ? 'stop new work; checkpoint and defer' : fhLeft <= 10 ? 'finish at a clean boundary; defer heavy work (plan_resume)' : 're-check that remaining work fits; defer what does not';
      parts.push(`5h window now ${Math.round(fhLeft)}% left${s.windows.five_hour.resets_at ? `, resets ${fmtClock(s.windows.five_hour.resets_at)}` : ''} — ${advice}`);
    }
    if (exh && !prev.exh) {
      parts.push(`at current burn may exhaust ~${fmtClock(s.burn.projected_exhaustion)}, before the reset — land at a clean boundary or defer now`);
    }
    if (ctxLeft != null && ctxBand > prev.ctx) {
      parts.push(
        `context now ${ctx.tokens_to_ceiling != null ? `~${fmtTokens(ctx.tokens_to_ceiling)} tokens` : `${Math.round(ctxLeft)}%`} before compaction — save a checkpoint NOW via the headroom \`checkpoint\` tool (task, state, decisions, ruled-out approaches, exact next steps); it will be re-injected to you after compaction`
      );
    }

    save({ fh: fhBand, ctx: ctxBand, exh, at: parts.length ? now : prev.at });
    if (fhBand !== prev.fh || ctxBand !== prev.ctx || exh !== prev.exh) {
      logEvent({
        type: 'band_change',
        session_id: p.session_id ?? null,
        emitted: parts.length > 0,
        fh_left: fhLeft != null ? Math.round(fhLeft) : null,
        exh,
      });
    }
    const lines = [...receipts, ...parts];
    if (lines.length) emit(lines);
  } catch {
    // mid-turn awareness is best-effort; never interfere with the tool loop
  }
}

/**
 * Launch gate (T2.14, opt-in): an agent about to overspend won't audit itself —
 * structurally fit_check expensive launches (subagents/workflows) and deny when the
 * window verdict is `defer`. Fail-open everywhere (ADR-13 pattern): missing state,
 * missing config, any error → allow.
 */
const EXPENSIVE_TOOLS = ['Task', 'Agent', 'Workflow'];

export async function hookPreToolUse() {
  const p = await readStdin();
  try {
    if (!readConfig().launch_gate) return;
    if (!EXPENSIVE_TOOLS.includes(p.tool_name)) return;
    const s = readState();
    if (!s || Date.now() / 1000 - s.updated_at > STALE_SEC) return;
    const { fitCheck } = await import('./fit.mjs');
    const fit = fitCheck(s, { est_tokens: 40000 }); // conservative launch-sized estimate
    if (fit?.window?.verdict !== 'defer') return;
    logEvent({ type: 'launch_blocked', session_id: p.session_id ?? null, tool: p.tool_name });
    const resets = s.windows?.five_hour?.resets_at;
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `headroom launch gate: the 5h window is nearly empty${resets ? ` (resets ${fmtClock(resets)})` : ''} — an expensive ${p.tool_name} launch now risks dying mid-work. Record the work with plan_resume and defer past the reset, or do a small piece inline. Disable: launch_gate in ~/.headroom/config.json.`,
        },
      })
    );
  } catch {
    // the gate must be impossible to blame for a wedged session — fail open
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
    // facts first (hook-captured), then judgment (model-authored) — ADR-8 + ADR-15
    const snap = takeHandoff(p.session_id);
    if (snap) parts.push(renderHandoff(snap));
    const note = takeCheckpoint(p.session_id);
    if (note) parts.push(renderCheckpoint(note));
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
  sampleFlow(payload.transcript_path, mySession); // velocity engine's FAST signal (T2.1)

  if (process.env.HEADROOM_DISABLE === '1' || !readConfig().stamp_enabled) {
    logEvent({ type: 'stamp_skipped', session_id: mySession, reason: 'disabled' });
    return;
  }
  const s = readState();
  if (!s || Date.now() / 1000 - s.updated_at > STALE_SEC) {
    logEvent({ type: 'stamp_skipped', session_id: mySession, reason: s ? 'stale_state' : 'no_state' });
    return;
  }

  // Rate-limit windows are account-level (true for every session). Context is
  // session-level: when state.json was last written by a DIFFERENT concurrent session,
  // its context would be a lie here — omit it.
  const foreign = mySession && s.session_id && mySession !== s.session_id;

  const parts = [];
  const fh = s.windows?.five_hour;
  const sd = s.windows?.seven_day;
  const ctx = foreign ? null : s.context;
  if (fh?.used_pct != null) {
    let seg = `5h: ${Math.round(100 - fh.used_pct)}% left`;
    // "tokens of quota", not "tokens": a bare token count next to a reset clock reads as
    // a CONTEXT pool that refills at that time (field-observed conflation, 2026-06-10 —
    // an agent deferred reading work to a rate-limit reset expecting fresh context)
    if (s.burn?.est_tokens_left != null) seg += ` (≈${fmtTokens(s.burn.est_tokens_left)} tokens of quota)`;
    if (fh.resets_at) seg += `, resets ${fmtClock(fh.resets_at)}`;
    const band = s.burn?.exhaustion_band;
    const exh = s.burn?.projected_exhaustion;
    if (band && fh.resets_at && band[0] < fh.resets_at) {
      seg += ` (at current pace, may run dry ~${fmtClock(band[0])}–${fmtClock(band[1])})`;
    } else if (exh && fh.resets_at && exh < fh.resets_at) {
      seg += ` (at current burn, may exhaust ~${fmtClock(exh)})`;
    }
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

  logEvent({
    type: 'stamp',
    session_id: mySession,
    fh_left: fh?.used_pct != null ? Math.round(100 - fh.used_pct) : null,
    ctx_tokens: ctx?.tokens_to_ceiling ?? null,
  });

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `[headroom] ${parts.join(' · ')}${ageMark}`,
      },
    })
  );
}
