import { writeFileSync, rmSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { headroomDir, ensureDir, atomicWriteJSON, readJSON, fmtClock } from './util.mjs';
import { readResume } from './resume.mjs';
import { logEvent } from './events.mjs';

// Armed resume (T2.15 / ADR-16): the USER schedules the spend; headroom only makes the
// scheduling trivial and transparent. Arming is per-plan (`headroom resume --arm`) or
// via the standing-consent flag `auto_arm` in config. Always: prints exactly what runs
// and when, writes output to a reviewable log, `--disarm` removes everything. Headroom
// NEVER arms itself without one of those two consents.

const LABEL = 'com.headroom.resume';
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const armPath = () => join(headroomDir(), 'arm.json');
const plistPath = () => join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const logPath = () => join(headroomDir(), 'resume-run.log');

export function buildPrompt(plan) {
  return (
    `You are resuming deferred work; the rate-limit window has reset and this run was explicitly armed by the user (headroom resume --arm). ` +
    `Deferred plan: "${plan.summary}". ` +
    `Start by reading docs/PLAN.md and docs/DECISIONS.md if present. Do the work autonomously with clean commits. ` +
    `If anything is ambiguous or risky, do NOT guess: write what you found and what you need to NOTES-FOR-USER.md and stop. ` +
    `When the deferred work is done, run \`node bin/headroom.mjs resume --clear\` and summarize what you did at the end of NOTES-FOR-USER.md.`
  );
}

export function buildPlist({ nodePath, hour, minute }) {
  const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>${xml(nodePath)}</string>
    <string>${xml(join(pkgRoot, 'bin', 'headroom.mjs'))}</string>
    <string>resume-run</string>
  </array>
  <key>StartCalendarInterval</key><dict>
    <key>Hour</key><integer>${hour}</integer>
    <key>Minute</key><integer>${minute}</integer>
  </dict>
  <key>StandardOutPath</key><string>${xml(logPath())}</string>
  <key>StandardErrorPath</key><string>${xml(logPath())}</string>
</dict></plist>
`;
}

export function armResume(argv = []) {
  const plan = readResume();
  if (!plan?.resume_at) return console.log('nothing to arm — record a deferred plan first (plan_resume)');
  if (process.platform !== 'darwin') return console.log('armed resume currently supports macOS launchd only — linux cron is on the roadmap');
  const dry = argv.includes('--dry-run');
  const mi = argv.indexOf('--max-turns');
  const maxTurns = mi >= 0 ? Number(argv[mi + 1]) || 50 : 50;
  const ci = argv.indexOf('--cwd');
  const cwd = ci >= 0 && argv[ci + 1] ? resolve(argv[ci + 1]) : process.cwd();

  let claudeBin = 'claude';
  try {
    claudeBin = execFileSync('/usr/bin/which', ['claude'], { encoding: 'utf8' }).trim() || 'claude';
  } catch {
    if (!dry) return console.log('cannot arm: `claude` CLI not found on PATH');
  }

  // fire 1 minute after the reset so the window is definitely fresh
  const d = new Date((plan.resume_at + 60) * 1000);
  const cmd = [claudeBin, '-p', buildPrompt(plan), '--max-turns', String(maxTurns), '--permission-mode', 'acceptEdits', '--allowedTools', 'Bash'];

  console.log(`armed resume — exactly this will run at ${fmtClock(plan.resume_at + 60)} in ${cwd}:`);
  console.log(`  ${cmd.map((c) => (c.includes(' ') ? `'${c.slice(0, 80)}…'` : c)).join(' ')}`);
  console.log(`  output → ${logPath()} · disarm anytime: headroom resume --disarm`);
  if (dry) return;

  ensureDir(headroomDir());
  atomicWriteJSON(armPath(), { cmd, cwd, resume_at: plan.resume_at, armed_at: Math.round(Date.now() / 1000), ran: false });
  mkdirSync(dirname(plistPath()), { recursive: true });
  writeFileSync(plistPath(), buildPlist({ nodePath: process.execPath, hour: d.getHours(), minute: d.getMinutes() }));
  try {
    execFileSync('launchctl', ['unload', plistPath()], { stdio: 'ignore' });
  } catch {
    // not loaded yet — fine
  }
  execFileSync('launchctl', ['load', plistPath()]);
  logEvent({ type: 'armed', resume_at: plan.resume_at });
}

export function disarmResume() {
  let removed = false;
  try {
    execFileSync('launchctl', ['unload', plistPath()], { stdio: 'ignore' });
  } catch {
    // not loaded
  }
  if (existsSync(plistPath())) {
    rmSync(plistPath());
    removed = true;
  }
  if (existsSync(armPath())) {
    rmSync(armPath());
    removed = true;
  }
  logEvent({ type: 'disarmed' });
  console.log(removed ? 'disarmed — scheduled resume removed' : 'nothing was armed');
}

/** Entry point launchd calls. Guards: plan must exist, reset passed, not already run. */
export function resumeRun() {
  try {
    const arm = readJSON(armPath());
    const now = Date.now() / 1000;
    if (!arm || arm.ran || now < arm.resume_at) return;
    atomicWriteJSON(armPath(), { ...arm, ran: true });
    logEvent({ type: 'resume_run', resume_at: arm.resume_at });
    appendFileSync(logPath(), `\n--- headroom armed resume firing ${new Date().toISOString()} ---\n`);
    const child = spawn(arm.cmd[0], arm.cmd.slice(1), { cwd: arm.cwd, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('exit', (code) => {
      appendFileSync(logPath(), `\n--- armed resume finished, exit ${code} ---\n`);
      disarmResume();
    });
  } catch {
    // an armed run must fail silent-but-logged, never wedge launchd
  }
}
