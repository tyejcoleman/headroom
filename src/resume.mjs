import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { headroomDir, ensureDir, readJSON, fmtClock } from './util.mjs';

// Reset scheduler: when work is deferred past a window reset (fit_check → defer), the
// model records a resume plan. The HUD shows a countdown; once the reset passes, the
// stamp and SessionStart flag the work as ready until the plan is cleared.

const planPath = () => join(headroomDir(), 'resume.json');
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
  ensureDir(headroomDir());
  writeFileSync(planPath(), JSON.stringify(plan, null, 2));
  return {
    recorded: true,
    resume_at: resumeAt,
    resume_at_clock: resumeAt ? fmtClock(resumeAt) : null,
    note: resumeAt
      ? `Deferred until the 5h window resets at ${fmtClock(resumeAt)}. Headroom will flag readiness in the HUD and prompt stamps; finish at a clean boundary now.`
      : 'No reset time known; plan recorded without a schedule.',
  };
}

export function readResume(nowSec = Date.now() / 1000) {
  const plan = readJSON(planPath());
  if (!plan || nowSec - plan.created_at > MAX_AGE_SEC) return null;
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
