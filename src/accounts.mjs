import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tokenroomDir, ensureDir, atomicWriteJSON, readJSON, accountDir, listAccountKeys, fmtClock } from './util.mjs';

// Multi-account profiles (ADR-24, amends ADR-21). Phase-derived account keys give
// ISOLATION but not stable IDENTITY: an idle account starts its next window at a new
// phase, so one physical account spreads over several key buckets (field 2026-07-01:
// 2 real accounts → 4+ buckets). Named profiles are the identity layer the user owns:
// a label maps to the set of buckets it has appeared as, plus an optional launch-time
// config dir (the official CLAUDE_CONFIG_DIR env var — selection happens only when the
// USER starts a session; sign-in state is never read, written, or swapped mid-session).
// Zero profiles → everything below no-ops and tokenroom behaves exactly as before.

const profilesPath = () => join(tokenroomDir(), 'profiles.json');
const LABEL_RE = /^[\w][\w.-]{0,31}$/; // labels land verbatim in stamps — keep them tame
export const PAIR_FRESH_SEC = 6 * 3600; // beyond this, reset clocks make snapshots useless
const ACTIVE_SEC = 10 * 60;
const NEW_BUCKET_SEC = 3600;
const ECHO_FROZEN_SEC = 5 * 60;

export function readProfiles() {
  const p = readJSON(profilesPath());
  return p && typeof p.profiles === 'object' && p.profiles !== null ? p.profiles : {};
}

function writeProfiles(profiles) {
  ensureDir(tokenroomDir());
  atomicWriteJSON(profilesPath(), { profiles });
}

/** The profile label a bucket key belongs to, or null (unlabeled keys keep today's behavior). */
export function profileForKey(key, profiles = readProfiles()) {
  if (!key) return null;
  for (const [label, p] of Object.entries(profiles)) if ((p.keys ?? []).includes(key)) return label;
  return null;
}

/** Assign a bucket key to a named profile (creating it), removing the key from any other
 *  profile — a bucket has exactly one identity. Returns the profile, or null on bad input. */
export function foldKey(key, label, nowSec = Date.now() / 1000) {
  if (!key || typeof key !== 'string' || !LABEL_RE.test(label ?? '')) return null;
  const profiles = readProfiles();
  for (const p of Object.values(profiles)) if (Array.isArray(p.keys)) p.keys = p.keys.filter((k) => k !== key);
  const prof = (profiles[label] ??= { keys: [] });
  if (!Array.isArray(prof.keys)) prof.keys = [];
  if (!prof.keys.includes(key)) prof.keys.push(key);
  prof.last_seen = Math.round(nowSec);
  writeProfiles(profiles);
  return prof;
}

/** `tokenroom account label <name>`: label the account of the most recent active session
 *  (the top-level state pointer — the tap mirrors the latest account there). */
export function labelCurrent(label, nowSec = Date.now() / 1000) {
  const key = readJSON(join(tokenroomDir(), 'state.json'))?.account_key ?? null;
  if (!key || !foldKey(key, label, nowSec)) return null;
  const s = readJSON(join(accountDir(key), 'state.json'));
  if (s?.windows) updateProfileSnapshot(key, s.windows, s.updated_at ?? nowSec);
  return key;
}

export function setProfileConfigDir(label, dir) {
  if (!LABEL_RE.test(label ?? '') || !dir || typeof dir !== 'string') return null;
  const profiles = readProfiles();
  const prof = (profiles[label] ??= { keys: [] });
  prof.config_dir = dir;
  writeProfiles(profiles);
  return prof;
}

/** Tap-side: keep a labeled profile's window snapshot fresh so pair advice has a
 *  one-read source even after the account's bucket goes idle. No profiles → no-op. */
export function updateProfileSnapshot(key, windows, nowSec = Date.now() / 1000) {
  try {
    const profiles = readProfiles();
    const label = profileForKey(key, profiles);
    if (!label) return;
    const pick = (w) => (w ? { used_pct: w.used_pct ?? null, resets_at: w.resets_at ?? null } : null);
    profiles[label].last_seen = Math.round(nowSec);
    profiles[label].last_windows_snapshot = {
      at: Math.round(nowSec),
      five_hour: pick(windows?.five_hour),
      seven_day: pick(windows?.seven_day),
    };
    writeProfiles(profiles);
  } catch {
    // profile bookkeeping must never break the tap
  }
}

/** A profile's freshest known quota: newest of its buckets' state files and its snapshot.
 *  `reset: true` means the 5h reset clock has PASSED since the data was written — the old
 *  percentage is wrong-signed and the window is effectively fresh/full. */
export function profileQuota(prof, nowSec = Date.now() / 1000) {
  try {
    let best = null;
    for (const key of prof?.keys ?? []) {
      const s = readJSON(join(accountDir(key), 'state.json'));
      if (s?.updated_at && (!best || s.updated_at > best.at)) {
        best = { at: s.updated_at, fh: s.windows?.five_hour ?? null, sd: s.windows?.seven_day ?? null };
      }
    }
    const snap = prof?.last_windows_snapshot;
    if (snap?.at && (!best || snap.at > best.at)) best = { at: snap.at, fh: snap.five_hour ?? null, sd: snap.seven_day ?? null };
    if (!best) return null;
    return {
      age_sec: Math.max(0, Math.round(nowSec - best.at)),
      fh_left: best.fh?.used_pct != null ? 100 - best.fh.used_pct : null,
      fh_resets: best.fh?.resets_at ?? null,
      sd_left: best.sd?.used_pct != null ? 100 - best.sd.used_pct : null,
      sd_resets: best.sd?.resets_at ?? null,
      reset: !!(best.fh?.resets_at && nowSec >= best.fh.resets_at),
    };
  } catch {
    return null;
  }
}

/** Heuristic fold ASSIST (never auto-merge): a brand-new unlabeled bucket appearing right
 *  after a labeled profile's window expired — while no other profile is active — is very
 *  probably that profile back under a new phase. Suggest the fold; the human runs it. */
export function suggestFold(nowSec = Date.now() / 1000, profiles = readProfiles()) {
  try {
    const entries = Object.entries(profiles);
    if (!entries.length) return [];
    const labeledKeys = new Set(entries.flatMap(([, p]) => p.keys ?? []));
    const expired = entries.filter(([, p]) => {
      const q = profileQuota(p, nowSec);
      return q?.fh_resets && nowSec >= q.fh_resets && nowSec - q.fh_resets < PAIR_FRESH_SEC;
    });
    const otherActive = entries.filter(
      ([label, p]) => nowSec - (p.last_seen ?? 0) < ACTIVE_SEC && !expired.some(([l]) => l === label)
    );
    if (expired.length !== 1 || otherActive.length) return [];
    const out = [];
    for (const key of listAccountKeys()) {
      if (labeledKeys.has(key)) continue;
      const s = readJSON(join(accountDir(key), 'state.json'));
      if (s?.updated_at && nowSec - s.updated_at <= NEW_BUCKET_SEC) out.push({ key, label: expired[0][0] });
    }
    return out;
  } catch {
    return [];
  }
}

/** The best OTHER profile to switch to: freshest-known headroom among labeled profiles the
 *  active key does not belong to. Excludes a profile the fold heuristic says the active
 *  (unlabeled) key probably IS — advising a "switch" to yourself would be the bug. */
export function bestOther(activeKey, nowSec = Date.now() / 1000) {
  try {
    const profiles = readProfiles();
    const activeLabel = profileForKey(activeKey, profiles);
    const excluded = new Set(activeLabel ? [activeLabel] : []);
    if (!activeLabel && activeKey) {
      for (const sug of suggestFold(nowSec, profiles)) if (sug.key === activeKey) excluded.add(sug.label);
    }
    let best = null;
    for (const [label, prof] of Object.entries(profiles)) {
      if (excluded.has(label)) continue;
      const q = profileQuota(prof, nowSec);
      if (!q || q.age_sec > PAIR_FRESH_SEC) continue; // stale beyond a reset clock = useless
      const left = q.reset ? 100 : q.fh_left;
      if (left == null) continue;
      if (!best || left > best.fh_left) {
        best = { label, fh_left: left, reset: q.reset, age_sec: q.age_sec, fh_resets: q.fh_resets, config_dir: prof.config_dir ?? null };
      }
    }
    return best;
  } catch {
    return null;
  }
}

export const fmtAge = (sec) => (sec < 90 ? 'moments' : sec < 7200 ? `${Math.round(sec / 60)}m` : `${Math.round(sec / 3600)}h`);

const describeLeft = (other) =>
  other.reset ? `fresh quota (its window reset ${other.fh_resets ? `at ${fmtClock(other.fh_resets)}` : 'already'})` : `≈${Math.round(other.fh_left)}% left`;

/**
 * PAIR-AWARE DESCENT (ADR-24): with a second fresh profile known, low quota on the ACTIVE
 * profile is not a throttle signal — the correct move is power through, then land-and-switch.
 * Fires only when the active window is low (<15% left) and the other profile has real
 * headroom (≥40% or a passed reset); both-thin keeps today's defer wording; healthy stays
 * silent (noise discipline). Age is always disclosed — the snapshot is history, not live.
 */
export function pairAdvice(activeKey, fhLeft, nowSec = Date.now() / 1000) {
  if (fhLeft == null || fhLeft >= 15) return null;
  const other = bestOther(activeKey, nowSec);
  if (!other || (!other.reset && other.fh_left < 40)) return null;
  const pct = describeLeft(other);
  return {
    other,
    pct,
    text: `profile '${other.label}' has ${pct} (as of ${fmtAge(other.age_sec)} ago) — finish this unit at full speed, then switch (/login or \`tokenroom switch\`) for zero downtime; defer only if BOTH profiles are thin`,
  };
}

/**
 * ECHO HONESTY (ADR-24): after /login the statusline keeps echoing rate_limits cached from
 * the OLD account's last completed turn, and every re-render re-stamps the echo as
 * 0m-fresh — so a dry pre-switch figure can be asserted as live for ~20 min (field capture
 * 2026-07-01 21:10–21:30). The tap now records `values_changed_at` (last time the window
 * VALUES moved). When the active account's figures are critical (<15% left), frozen for
 * >5 min, AND a sibling account has values-newer data, the confident figure is downgraded
 * to honesty wording — never assert a frozen dry number while a fresher sibling exists.
 */
export function staleEcho(activeKey, state, nowSec = Date.now() / 1000) {
  try {
    if (!activeKey) return null;
    const fhLeft = state?.windows?.five_hour?.used_pct != null ? 100 - state.windows.five_hour.used_pct : null;
    const changedAt = state?.values_changed_at ?? null;
    if (fhLeft == null || fhLeft >= 15 || changedAt == null || nowSec - changedAt <= ECHO_FROZEN_SEC) return null;
    let sibling = null;
    for (const key of listAccountKeys()) {
      if (key === activeKey) continue;
      const s = readJSON(join(accountDir(key), 'state.json'));
      const sibChanged = s?.values_changed_at ?? s?.updated_at ?? 0;
      if (sibChanged > changedAt && (!sibling || sibChanged > sibling.changed_at)) {
        sibling = {
          key,
          label: profileForKey(key),
          changed_at: sibChanged,
          fh_left: s?.windows?.five_hour?.used_pct != null ? 100 - s.windows.five_hour.used_pct : null,
        };
      }
    }
    if (!sibling) return null;
    return { frozen_min: Math.round((nowSec - changedAt) / 60), sibling };
  } catch {
    return null;
  }
}

// ── Human CLI surfaces: account list · switch · run ─────────────────────────

const quotaLine = (q) => {
  if (!q) return 'no data yet';
  if (q.reset) return `5h window reset ${fmtClock(q.fh_resets)} — fresh quota (as of ${fmtAge(q.age_sec)} ago)`;
  let seg = q.fh_left != null ? `5h ${Math.round(q.fh_left)}% left${q.fh_resets ? ` ↻${fmtClock(q.fh_resets)}` : ''}` : '5h ?';
  if (q.sd_left != null) seg += ` · 7d ${Math.round(q.sd_left)}% left${q.sd_resets ? ` ↻${fmtClock(q.sd_resets)}` : ''}`;
  return `${seg} · as of ${fmtAge(q.age_sec)} ago`;
};

export function renderAccountList(nowSec = Date.now() / 1000) {
  const profiles = readProfiles();
  const entries = Object.entries(profiles);
  const lines = [];
  if (entries.length) {
    lines.push('profiles:');
    for (const [label, p] of entries) {
      let seg = `  ${label.padEnd(12)} ${quotaLine(profileQuota(p, nowSec))}`;
      seg += ` · ${(p.keys ?? []).length} bucket${(p.keys ?? []).length === 1 ? '' : 's'}`;
      if (p.config_dir) seg += ` · config-dir ${p.config_dir}`;
      lines.push(seg);
    }
  } else {
    lines.push("no profiles yet — label the account you're on: tokenroom account label <name>");
  }
  const labeledKeys = new Set(entries.flatMap(([, p]) => p.keys ?? []));
  const unlabeled = listAccountKeys().filter((k) => !labeledKeys.has(k));
  if (unlabeled.length) {
    lines.push('unlabeled buckets:');
    for (const key of unlabeled) {
      const s = readJSON(join(accountDir(key), 'state.json'));
      const fh = s?.windows?.five_hour;
      let seg = `  ${key}`;
      if (fh?.used_pct != null) seg += `  5h ${Math.round(100 - fh.used_pct)}% left${fh.resets_at ? ` ↻${fmtClock(fh.resets_at)}` : ''}`;
      if (s?.updated_at) seg += ` · as of ${fmtAge(nowSec - s.updated_at)} ago`;
      lines.push(seg);
    }
    for (const sug of suggestFold(nowSec, profiles)) {
      lines.push(`  hint: new bucket ${sug.key} is probably '${sug.label}' — fold with: tokenroom account fold ${sug.key} ${sug.label}`);
    }
    if (entries.length) lines.push('  fold a bucket into its profile: tokenroom account fold <key> <name>');
  }
  return lines.join('\n');
}

export function renderSwitch(nowSec = Date.now() / 1000) {
  const profiles = readProfiles();
  const entries = Object.entries(profiles);
  if (!entries.length) return "no profiles yet — label the account you're on first: tokenroom account label <name>";

  const activeKey = readJSON(join(tokenroomDir(), 'state.json'))?.account_key ?? null;
  const activeLabel = profileForKey(activeKey, profiles);
  const rows = entries.map(([label, p]) => ({ label, p, q: profileQuota(p, nowSec) }));
  let best = null;
  for (const r of rows) {
    if (!r.q || r.q.age_sec > PAIR_FRESH_SEC) continue;
    const left = r.q.reset ? 100 : r.q.fh_left;
    if (left == null) continue;
    if (!best || left > best.left) best = { ...r, left };
  }

  const lines = ['tokenroom switch — profile decision table'];
  for (const r of rows) {
    const marks = [r.label === activeLabel ? 'active' : null, best && r.label === best.label ? 'most headroom' : null].filter(Boolean);
    lines.push(`  ${r.label === activeLabel ? '·' : ' '} ${r.label.padEnd(12)} ${quotaLine(r.q)}${marks.length ? `   ← ${marks.join(', ')}` : ''}`);
  }
  if (!best) {
    lines.push('no profile has fresh-enough data (<6h) to recommend — use whichever you know is fresh, then re-check.');
  } else if (best.label === activeLabel) {
    lines.push(`stay put: '${best.label}' already has the most known headroom (${best.q.reset ? 'fresh after reset' : `≈${Math.round(best.left)}% left`}).`);
  } else {
    lines.push(`recommended: switch to '${best.label}' (${best.q.reset ? 'fresh after reset' : `≈${Math.round(best.left)}% left`}${activeLabel ? `, vs '${activeLabel}' active` : ''}).`);
    lines.push(`  same terminal: run /login inside Claude Code and pick the '${best.label}' account (takes effect for that session).`);
    if (best.p.config_dir) {
      lines.push(`  new terminal:  CLAUDE_CONFIG_DIR=${best.p.config_dir} claude   (or: tokenroom run --profile ${best.label})`);
    } else {
      lines.push(`  tip: give '${best.label}' its own config dir to enable direct launch: tokenroom account config-dir ${best.label} <path>, then \`tokenroom run\``);
    }
  }
  return lines.join('\n');
}

/**
 * `tokenroom run [--profile X] [--dry-run]`: launch an interactive `claude` under the
 * profile's config dir (official CLAUDE_CONFIG_DIR env var). No flag → max known headroom.
 * Compliance boundary (ADR-24): this is launch-time CONFIG SELECTION for a session the
 * user starts — auth files are never read or written, and nothing is swapped mid-session.
 */
export function runProfile(argv = [], nowSec = Date.now() / 1000) {
  const pi = argv.indexOf('--profile');
  const dry = argv.includes('--dry-run');
  const profiles = readProfiles();
  let label = pi >= 0 ? argv[pi + 1] : null;
  if (label && !profiles[label]) {
    console.log(`no profile '${label}' — see: tokenroom account list`);
    process.exitCode = 1;
    return;
  }
  if (!label) {
    const best = bestOther(null, nowSec); // no active key excluded → the overall max headroom
    label = best?.label ?? null;
  }
  const prof = label ? profiles[label] : null;
  if (!prof) {
    console.log('no profile with fresh data to pick — tokenroom account label <name> first, or pass --profile <name>');
    process.exitCode = 1;
    return;
  }
  if (!prof.config_dir) {
    console.log(`profile '${label}' has no config dir — set one: tokenroom account config-dir ${label} <path>\n(or switch in-session with /login)`);
    process.exitCode = 1;
    return;
  }
  const cmd = `CLAUDE_CONFIG_DIR=${prof.config_dir} claude`;
  if (dry) {
    console.log(cmd);
    return;
  }
  console.log(`launching '${label}': ${cmd}`);
  const r = spawnSync('claude', [], { stdio: 'inherit', env: { ...process.env, CLAUDE_CONFIG_DIR: prof.config_dir } });
  if (r.error) console.log(`could not launch claude (${r.error.code ?? r.error.message}) — run it yourself: ${cmd}`);
  process.exitCode = typeof r.status === 'number' ? r.status : process.exitCode;
}
