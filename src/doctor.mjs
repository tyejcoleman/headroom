import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { headroomDir, readJSON, fmtDelta } from './util.mjs';
import { readState } from './state.mjs';
import { listPins } from './pins.mjs';
import { readResume } from './resume.mjs';

// `headroom doctor` — one command that answers "why isn't it working?" before anyone
// has to file an issue. Born from field incidents: a THIRD-PARTY hook's failure being
// misattributed to headroom (Claude Code's hook errors aren't attributed per-hook), an
// npx-cache install whose absolute paths evaporated, and stale state read as live data.

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARK = 'headroom.mjs';

export function doctor(argv = []) {
  const ci = argv.indexOf('--config-dir');
  const dir = ci >= 0 && argv[ci + 1] ? resolve(argv[ci + 1]) : process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  const lines = [];
  let problems = 0;
  const ok = (msg) => lines.push(`  ✓ ${msg}`);
  const bad = (msg, fix) => {
    problems++;
    lines.push(`  ✗ ${msg}${fix ? `\n      fix: ${fix}` : ''}`);
  };
  const info = (msg) => lines.push(`  - ${msg}`);

  // runtime
  const major = Number(process.versions.node.split('.')[0]);
  major >= 18 ? ok(`node ${process.versions.node}`) : bad(`node ${process.versions.node} — headroom needs ≥18`);
  pkgRoot.includes('/_npx/') || pkgRoot.includes('\\_npx\\')
    ? bad('running from the npx cache — installed paths will evaporate', 'npm install -g headroom-harness, or run from a clone')
    : ok(`install location is durable (${pkgRoot})`);

  // settings.json wiring
  const settings = readJSON(join(dir, 'settings.json')) ?? {};
  settings.statusLine?.command?.includes(MARK)
    ? ok('statusline tap registered')
    : bad('statusline tap not registered', `node ${join(pkgRoot, 'bin', 'headroom.mjs')} install`);
  const HOOKS = ['UserPromptSubmit', 'PreCompact', 'SessionStart', 'PostCompact', 'PostToolUse', 'PreToolUse'];
  for (const event of HOOKS) {
    const matchers = settings.hooks?.[event] ?? [];
    const ours = matchers.flatMap((m) => m.hooks ?? []).filter((h) => h.command?.includes(MARK));
    if (!ours.length) {
      bad(`hook ${event}: not registered`, 'headroom install');
      continue;
    }
    // the absolute path inside the quoted command must still exist
    const path = ours[0].command.match(/"([^"]*headroom\.mjs)"/)?.[1];
    path && !existsSync(path) ? bad(`hook ${event}: registered but ${path} no longer exists`, 'headroom install from the current location') : ok(`hook ${event} registered`);
    const foreign = matchers.flatMap((m) => m.hooks ?? []).filter((h) => h.command && !h.command.includes(MARK));
    if (foreign.length)
      info(`note: ${foreign.length} other ${event} hook(s) share this event — Claude Code does NOT attribute hook errors per-hook, so their failures can look like headroom's (check: \`${foreign[0].command.slice(0, 60)}…\`)`);
  }

  // skill freshness
  const skillFile = join(dir, 'skills', 'headroom', 'SKILL.md');
  if (!existsSync(skillFile)) bad('skill not installed', 'headroom install');
  else
    readFileSync(skillFile, 'utf8') === readFileSync(join(pkgRoot, 'skill', 'SKILL.md'), 'utf8')
      ? ok('skill installed and current')
      : bad('skill installed but OUTDATED vs this version', 'headroom install (now content-compares and updates)');

  // claude CLI (needed for MCP registration)
  try {
    execFileSync('/usr/bin/which', ['claude'], { stdio: 'pipe' });
    ok('claude CLI on PATH');
  } catch {
    info('claude CLI not found on PATH — MCP auto-registration needs it');
  }

  // data freshness
  const s = readState();
  if (!s) bad('no ResourceState yet', 'open a Claude Code session; the tap writes on first render');
  else {
    const age = Date.now() / 1000 - s.updated_at;
    age < 30 * 60 ? ok(`state.json fresh (${fmtDelta(age)} old)`) : info(`state.json is ${fmtDelta(age)} old — fine if no session is active`);
    s.windows?.five_hour
      ? ok('rate-limit windows present (subscription auth)')
      : info('no rate_limits in payload — API-key auth? headroom degrades to context-only awareness');
    s.burn?.tokens_per_pct
      ? ok(`velocity calibrated: ≈${Math.round(s.burn.tokens_per_pct / 1000)}k tokens per window-% (improves with use)`)
      : info('velocity not yet calibrated — tokens-left estimates appear after some real usage');
  }

  // working state
  const pins = listPins();
  if (pins.length) info(`${pins.length} pin(s) active (headroom pins)`);
  const plan = readResume();
  if (plan) info(`deferred plan recorded${plan.resume_at ? ` (resume ${fmtDelta(plan.resume_at - Date.now() / 1000)})` : ''}`);

  console.log(`headroom doctor — ${dir}\n${lines.join('\n')}\n${problems ? `${problems} problem(s) found` : 'no problems found'}`);
  if (problems) process.exitCode = 1;
}
