import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tokenroomDir, ensureDir, atomicWriteJSON, readJSON, fmtClock } from './util.mjs';

// Reset scheduler: when work is deferred past a window reset (fit_check → defer), the
// model records a resume plan. The HUD shows a countdown; once the reset passes, the
// stamp and SessionStart flag the work as ready until the plan is cleared.

const planPath = () => join(tokenroomDir(), 'resume.json');
const MAX_AGE_SEC = 24 * 3600;

export function planResume({ summary, est_tokens } = {}, state, nowSec = Date.now() / 1000) {
  if (!summary || typeof summary !== 'string') return { error: 'summary (string) is required' };
  const resumeAt = state?.windows?.five_hour?.resets_at ?? null;
  const plan = {
    summary: summary.slice(0, 500),
    est_tokens: typeof est_tokens === 'number' ? est_tokens : null,
    created_at: Math.round(nowSec),
    resume_at: resumeAt,
  };
  ensureDir(tokenroomDir());
  atomicWriteJSON(planPath(), plan);
  return {
    recorded: true,
    resume_at: resumeAt,
    resume_at_clock: resumeAt ? fmtClock(resumeAt) : null,
    note: resumeAt
      ? `Deferred until the 5h window resets at ${fmtClock(resumeAt)}. Tokenroom will flag readiness in the HUD and prompt stamps; finish at a clean boundary now.`
      : 'No reset time known; plan recorded without a schedule.',
  };
}

export function readResume(nowSec = Date.now() / 1000) {
  const plan = readJSON(planPath());
  // Validate shape at the SOURCE. A plan missing a string summary or a numeric created_at is
  // corrupt: `nowSec - undefined` is NaN so the 24h expiry NEVER fires (the file would then
  // silence every stamp forever), and consumers reading plan.summary would throw. Reject it
  // here so both failure modes close at once (ADR-5: degrade, never let one bad file cascade).
  if (!plan || typeof plan.summary !== 'string' || typeof plan.created_at !== 'number') return null;
  if (nowSec - plan.created_at > MAX_AGE_SEC) return null;
  return plan;
}

export function clearResume() {
  try {
    rmSync(planPath());
    return true;
  } catch {
    return false;
  }
}
