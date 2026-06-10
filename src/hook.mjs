import { readState } from './state.mjs';
import { readConfig, fmtClock, fmtTokens } from './util.mjs';

const STALE_SEC = 30 * 60;

/**
 * UserPromptSubmit hook: emit a tiny headroom stamp as additionalContext.
 * Wording rule (validated in eval v0/v1): always REMAINING-first, with absolute
 * tokens where known. Silent when disabled, missing, or stale — never inject a lie.
 */
export async function hookUserPromptSubmit() {
  let raw = '';
  try {
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) raw += chunk;
  } catch {
    // payload read is best-effort
  }
  let mySession = null;
  try {
    mySession = JSON.parse(raw)?.session_id ?? null;
  } catch {
    mySession = null;
  }

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
  if (!parts.length) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `[headroom] ${parts.join(' · ')}`,
      },
    })
  );
}
