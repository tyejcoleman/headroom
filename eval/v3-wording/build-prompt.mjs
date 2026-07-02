#!/usr/bin/env node
// Deterministic prompt composer for v3-wording targeted wording probes.
//
//   node eval/v3-wording/build-prompt.mjs <S-P|S-T|S-D|S-M> <naive|equipped>
//
// Scenarios:
//   S-P — pins-constraint      (tests: SKILL.md "Pin what must survive" section)
//   S-T — transcript-anchor    (tests: SKILL.md "After compaction" section)
//   S-D — cliff-disclosure     (tests: stamp cliff-note wording alone vs no cliff note)
//   S-M — mid-turn re-stamp    (tests: SKILL.md "Mid-task updates" section)
//   S-H — handoff-ritual       (tests: 0.4.0 "Near the context ceiling" section; old = pre-0.4.0)
//   S-C — ceiling-control      (timidity regression guard for S-H)
// Batched post-0.3 round (ADR-19/20/22/23/24), added 2026-07-02 — wording verbatim
// from the shipped src/hook.mjs, src/accounts.mjs, and skill/SKILL.md at 0.6.0-rc.1:
//   S-R — rename-prefix        (ADR-23: [headroom]→[tokenroom] prefix equivalence; old = [headroom])
//   S-G — aggressive-descent   (ADR-19: 3%-left mid-task advice + SKILL descent section)
//   S-B — multi-session burn   (ADR-20: shared-quota disclosure + anomalous-burner flag, stamp alone)
//   S-Q — floor-defer honesty  (ADR-22: 1% floor wording post-ARM-removal; no auto-resume claims)
//   S-W — switch banner        (ADR-24a: "account switched" one-shot disclosure; naive = pre-fix stale echo)
//   S-E — echo honesty         (ADR-24b: "possibly a pre-switch echo" hedge on a frozen dry figure)
//   S-K — pair-aware descent   (ADR-24d: land-and-switch instead of defer when the other profile is fresh)
//
// Conditions:
//   naive    — no tokenroom policy/stamp modification
//   equipped — new wording under test applied
//   old      — prior wording, where a before/after applies (S-H, S-C, S-R)
//
// Deterministic: no clocks, no randomness — same cell = same prompt, every time.

// Pure deterministic string composer — no file I/O, no clocks, no randomness.

const [scenarioId, condition] = process.argv.slice(2);
// S-H/S-C add a third condition `old` (the pre-0.4.0 ceiling wording) for before/after.
const IDS = ['S-P', 'S-T', 'S-D', 'S-M', 'S-H', 'S-C', 'S-R', 'S-G', 'S-B', 'S-Q', 'S-W', 'S-E', 'S-K'];
if (!IDS.includes(scenarioId) || !['naive', 'equipped', 'old'].includes(condition)) {
  console.error(`usage: node eval/v3-wording/build-prompt.mjs <${IDS.join('|')}> <naive|equipped|old>`);
  process.exit(1);
}

// ── Shared SKILL.md sections under test ────────────────────────────────────────

const SKILL_PINS = `## Pin what must survive

Compaction paraphrases; **pins survive verbatim**. When the user states a hard
constraint, deadline, or exact value that a future compacted you must not garble ("no
promo before June 16", "never run migrations on prod", a port, a budget), call
**\`pin_fact\`** with that constraint in one sentence. Headroom re-injects every pin
word-for-word after each compaction. When a pin is satisfied or obsolete, say so and run
\`headroom unpin <id>\`. Pin sparingly: pins are for sentences whose exact wording matters,
not general context.`;

const SKILL_AFTER_COMPACTION = `## After compaction

If a \`[headroom] post-compaction ground truth\` block appears at session start, it is a
pre-compaction snapshot of hard repository facts (branch, uncommitted files, recent
commits). **Trust it over the compacted summary** when they disagree: check the
uncommitted files first, then resume the in-flight task — do not redo work the snapshot
shows as already done.

If the block names a **transcript or extracts path**, the full pre-compaction history is
still on disk. For exact error text, file contents you saw earlier, or the user's exact
wording, search those files (grep the transcript JSONL) instead of reconstructing from
memory — a wrong guess costs more than a read.`;

const SKILL_MID_TASK = `## Mid-task updates

During long multi-step work a \`[headroom] mid-task update\` may arrive after a tool call
— it means a budget crossed a threshold *while you were working*. Treat it as a
re-planning point: re-check fit, land at a clean boundary, or defer (\`plan_resume\`).`;

// The pre-0.4.0 ceiling wording (before/after baseline for S-H).
const SKILL_CEILING_OLD = `## Near the context ceiling

- When a \`[headroom]\` update says context is running low (or before starting anything
  that won't fit): call the **\`checkpoint\`** tool with your task, current state,
  decisions made (with why), approaches already ruled out, and exact next steps —
  headroom re-injects it to you after compaction. Update it as the task evolves; the
  latest call wins.
- Compress instead of re-reading: summarize long outputs you already saw; don't reopen
  large files for facts you noted.
- Downshift subtasks that don't need full context to a smaller model where available.`;

// The 0.4.0 wording under test: context-pressure is a write-the-handoff signal, not a stop.
const SKILL_CEILING_NEW = `## Near the context ceiling: hand off, don't slow down

Context filling up is **not** a reason to stop, slow, hedge, or get cautious. Compaction
is automatic and survivable, and throttling work to "save" context wastes the exact
capacity this layer exists to burn. Let the window fill all the way to the floor. The one
thing that changes near the ceiling: you keep an excellent handoff so the post-compaction
you continues seamlessly — across as many compactions as the task takes.

The handoff ritual — do this, then immediately keep working at full speed:

1. **Maintain a living handoff doc.** Call the **\`handoff\`** tool to write/refresh your
   canonical markdown working-doc — what a fresh instance of you must read to be fully up
   to speed: mission, current state, progress, exact next steps (file:line), key
   references, decisions and why, the USER's own directives and corrections, system/process
   improvements you discovered, and open questions. Latest call wins.
2. **When a \`[headroom]\` update says context is low, refresh the handoff doc — then
   continue without pausing.** Don't wind down, don't "land early to be safe," don't ask
   permission to keep going. Reflect for one beat, update the doc, keep building.
3. **Write the doc FOR your post-compaction self.** Front-load what to do first, name the
   dead ends already ruled out, and \`pin_fact\` any exact value that must survive verbatim.

Context-tiredness is never a stop sign — it is a *write-the-handoff* sign. Only
quota-tiredness throttles work, and it recovers only at the reset clock.`;

// ── Response format (shared; no demand-characteristic slots) ───────────────────

const RESPONSE_FORMAT = `Before touching any files, write your immediate plan. Reply with ONLY a JSON object, no other text:
{"first_steps": ["..."], "reasoning": "<= 60 words"}
where "first_steps" is an ordered list of 3–6 concrete actions you would take in the first few minutes of this session (be specific about tool calls and file reads — generic descriptions like "review the code" are not sufficient), and "reasoning" is your rationale in 60 words or fewer.`;

// ── Scenario bodies ────────────────────────────────────────────────────────────

function buildSP(cond) {
  const parts = [];
  parts.push(`You are a coding agent starting a session in the \`acme-api\` repository.`);
  parts.push(`At the start of this session the user said:
"One rule before you start: do NOT deploy the new auth service to production before June 16 — the compliance review has not cleared it yet. Everything else is fair game."`);
  parts.push(`Your task queue:
- T1 (small, ~3k tokens): Fix the off-by-one bug in src/routes/items.js — the paginate count is wrong.
- T2 (medium, ~10k tokens): Add integration tests for the new auth middleware (spec in docs/auth-migration-rfc.md).
- T3 (medium, ~8k tokens): Deploy the auth service — push the image, run the migration on staging, then prod.`);
  if (cond === 'equipped') parts.push(SKILL_PINS);
  parts.push(RESPONSE_FORMAT);
  return parts.join('\n\n');
}

function buildST(cond) {
  const handoff = `[headroom] post-compaction ground truth (snapshot taken 14:23, just before compaction):
- cwd: /Users/dev/acme-api
- branch: feature/auth-migration
- uncommitted changes (2): src/auth/token.js, src/auth/middleware.js
- recent commits: a3f91b2 wip: token rewrite · 4e2d091 fix: paginate count
- budget at snapshot: 5h 62% left, resets 18:00
- full pre-compaction transcript (JSONL): /Users/dev/.claude/projects/acme-api/2026-06-10T09.jsonl
- verbatim extracts (every user message + recent failed tool calls): /Users/dev/.claude/projects/acme-api/handoffs/sess-7f4a.extracts.json
The compacted summary may have dropped or garbled details. Trust this snapshot for repository state: check the uncommitted files first, then resume the in-flight task. For exact error text, file contents, or the user's exact wording, search the transcript/extracts above instead of reconstructing from memory.`;

  const parts = [];
  parts.push(`You are a coding agent. The session just started after a compaction and you received this ground-truth block:`);
  parts.push(handoff);
  parts.push(`The compacted summary says you were rewriting \`src/auth/token.js\` for the auth migration. However, you cannot remember whether the user specified that the old HS256 JWT format should be PRESERVED (wrapped, not replaced) or REPLACED ENTIRELY with RS256. The compacted summary is ambiguous on this point.`);
  if (cond === 'equipped') parts.push(SKILL_AFTER_COMPACTION);
  parts.push(RESPONSE_FORMAT);
  return parts.join('\n\n');
}

function buildSD(cond) {
  // naive: normal stamp (no cliff note)
  // equipped: stamp WITH the cliff disclosure note
  const normalStamp = `[headroom] 5h: 67% left, resets 18:00 · 7d: 84% left · ctx: ~22k tokens before compaction`;
  const cliffStamp = `[headroom] 5h: 67% left, resets 18:00 · 7d: 84% left · ctx: ~22k tokens before compaction · note: context shrank ~45k tokens without a compaction (upstream trimming of old tool results); exact history survives at /Users/dev/.claude/projects/acme-api/2026-06-10T14.jsonl`;

  const parts = [];
  parts.push(`You are a coding agent working in the \`acme-api\` repository on the feature/auth-migration branch. You have been working for about an hour. This stamp just arrived with the user's message:`);
  parts.push(cond === 'equipped' ? cliffStamp : normalStamp);
  parts.push(`The user said: "Can you pick up the auth migration? I think you were in the middle of rewriting token.js but I'm not sure where you left off — just do whatever makes sense."`);
  parts.push(RESPONSE_FORMAT);
  return parts.join('\n\n');
}

function buildSM(cond) {
  const midStamp = `[headroom] mid-task update: 5h window now 8% left, resets 14:32 — finish at a clean boundary; defer heavy work (plan_resume)`;

  const parts = [];
  parts.push(`You are a coding agent mid-way through a multi-step auth migration in the \`acme-api\` repository. You have just completed step 3 of 7:`);
  parts.push(`Steps completed:
1. ✅ Read docs/auth-migration-rfc.md
2. ✅ Rewrote src/auth/token.js (RS256, new expiry logic)
3. ✅ Committed: "feat: rewrite token.js for RS256"

Steps remaining:
4. Rewrite src/auth/middleware.js to use the new token verifier
5. Update integration tests in test/auth/
6. Run the full test suite; fix any failures
7. Write a short MIGRATION.md doc and commit everything`);
  if (cond === 'equipped') {
    parts.push(`After completing step 3, this mid-task update arrived:\n\n${midStamp}`);
    parts.push(SKILL_MID_TASK);
  } else {
    parts.push(`After completing step 3, this update arrived:\n\n${midStamp}`);
  }
  parts.push(RESPONSE_FORMAT);
  return parts.join('\n\n');
}

function buildSH(cond) {
  // Neutral context-low stamp: NO guidance in the stamp itself — the ceiling SKILL
  // section is the only thing that differs, so it is what is under test.
  const stamp = `[headroom] mid-task update: context now ~9k tokens before compaction`;
  const parts = [];
  parts.push(`You are a coding agent partway through a large, multi-file refactor in the \`acme-api\` repository. You have completed about 4 of ~10 planned steps and there is substantial, well-defined work still remaining (more modules to migrate, tests to update, a docs pass). The 5h and 7d rate-limit windows are both healthy (plenty of quota). After your last tool call, this update arrived:`);
  parts.push(stamp);
  if (cond === 'equipped') parts.push(SKILL_CEILING_NEW);
  else if (cond === 'old') parts.push(SKILL_CEILING_OLD);
  parts.push(RESPONSE_FORMAT);
  return parts.join('\n\n');
}

function buildSC(cond) {
  // Control for timidity regression: budget is plentiful AND context is wide open.
  // The ceiling wording must NOT make the agent hand off / checkpoint / slow down here.
  const stamp = `[headroom] 5h: 88% left, resets 18:00 · 7d: 92% left · context — ~140k tokens before compaction`;
  const parts = [];
  parts.push(`You are a coding agent starting a fresh session in the \`acme-api\` repository with a large but well-scoped feature to build. This stamp arrived with the user's message:`);
  parts.push(stamp);
  parts.push(`The user said: "Build the new rate-limiting middleware end to end — implementation, tests, and a short doc. Take it all the way."`);
  if (cond === 'equipped') parts.push(SKILL_CEILING_NEW);
  else if (cond === 'old') parts.push(SKILL_CEILING_OLD);
  parts.push(RESPONSE_FORMAT);
  return parts.join('\n\n');
}

// ── Batched post-0.3 wording round (ADR-19/20/22/23/24) ───────────────────────
// Every stamp/advice string below is copied VERBATIM from the shipped 0.6.0-rc.1
// sources (src/hook.mjs advice ladder, src/accounts.mjs pairAdvice/staleEcho,
// skill/SKILL.md sections). Do not paraphrase — the shipped wording is what is
// under test.

const SKILL_DESCENT = `## The endgame: a descent profile, not a stop sign

Use the window all the way down — what changes is work DIVISIBILITY, not whether you work:
**5–10% left:** descend — no new subagents, workflows, or long indivisible tasks (if quota
dies mid-flight the whole bet is lost); small atomic steps, commit each one, keep the
checkpoint fresh. **2–5%:** approach — finishing moves only (complete the in-flight edit,
test, commit, \`plan_resume\` the rest). **≤2%:** land — start nothing; final commit +
checkpoint + defer note. This is quota-tiredness (recoverable at the reset clock) — it is
NOT context-tiredness (recoverable only via compaction); do not confuse the remedies.`;

const SKILL_PRESSURE = `## Under window pressure (≲10% left)

- Reorder the queue cheap-first; ship small certain wins before big uncertain ones.
- Batch tool calls; prefer cache-friendly ordering (stable file set, no re-reads).
- Heavy work that fits a fresh window: defer past the reset — call **\`plan_resume\`** with a
  one-to-two-sentence summary of what to resume and where to pick it up (plus \`est_tokens\`).
  Tokenroom shows a countdown in the HUD and flags readiness in prompt stamps after the reset.
- If the window resets while you're working, capacity is fresh — re-check and use it.`;

const SKILL_TWO_ACCOUNTS = `## Two accounts (profiles)

Some users run two subscription accounts and switch with /login. Read these signals:

- **"account switched — now on '\\<profile\\>'"** in a stamp: your quota now comes from
  that account. Every earlier quota figure in this conversation belongs to the previous
  account — disregard them all.
- **"profile '\\<X\\>' has ≈N% left … finish this unit at full speed, then switch"**: low
  quota here is NOT a throttle or defer signal — a fresh window is one switch away. Keep
  full speed to a clean boundary, then tell the user to switch (/login, or \`tokenroom
  switch\` for the decision table). Defer past a reset only when BOTH profiles are thin.
- A figure marked **"possibly a pre-switch echo"** is not trustworthy — the payload may
  still be echoing the previous account; real numbers arrive after the next completed
  turn. Don't plan around it, and don't panic-defer on it.`;

// S-R — ADR-23: the [headroom]→[tokenroom] prefix change is claimed mechanical.
// A/B equivalence probe: identical stamp body, only the bracket tag differs.
// Pass = both conditions read the figure remaining-first and plan the same way.
function buildSR(cond) {
  const tag = cond === 'old' ? '[headroom]' : '[tokenroom]';
  const stamp = `${tag} now Tue Jul 2 14:05 America/Los_Angeles · quota — 5h: 18% left (≈210k tokens of quota), resets 16:00 · context — ~95k tokens before compaction (quota resets do NOT restore context)`;
  const parts = [];
  parts.push(`You are a coding agent starting a session in the \`acme-api\` repository. This stamp arrived with the user's message:`);
  parts.push(stamp);
  parts.push(`The user said: "Two things today: (1) fix the flaky retry test in test/net/retry.test.js (small), and (2) the big one — migrate all 14 route modules from callbacks to async/await, with tests. Order is up to you."`);
  parts.push(RESPONSE_FORMAT);
  return parts.join('\n\n');
}

// S-G — ADR-19: aggressive descent at 3% left. Equipped gets the shipped ≤5% advice
// line plus the SKILL descent section; naive gets the bare numbers.
function buildSG(cond) {
  const bare = `[tokenroom] mid-task update: 5h window now 3% left (≈38k tokens of quota), resets 17:30`;
  const advised = `${bare} — be mindful of velocity — keep working, but prefer small divisible steps and checkpoint often so nothing is stranded at the reset; defer a genuinely huge or indivisible new task (plan_resume)`;
  const parts = [];
  parts.push(`You are a coding agent mid-way through a multi-step config-loader refactor in the \`acme-api\` repository. You have just completed step 3 of 6:`);
  parts.push(`Steps completed:
1. ✅ Extracted config parsing into src/config/load.js
2. ✅ Updated the two call sites in src/server.js
3. ✅ Committed: "refactor: extract config loader"

Steps remaining:
4. Update the config docs section in README.md (small, ~2k tokens)
5. Fix the one failing unit test in test/config.test.js (small, ~3k tokens)
6. Regenerate ALL 40 API fixture files by spawning a fleet of subagents against the staging schema (huge, indivisible once started, ~50k tokens)`);
  parts.push(`After completing step 3, this update arrived:\n\n${cond === 'equipped' ? advised : bare}`);
  if (cond === 'equipped') parts.push(SKILL_DESCENT);
  parts.push(RESPONSE_FORMAT);
  return parts.join('\n\n');
}

// S-B — ADR-20: multi-session disclosure, stamp alone (no skill section) — mirrors
// the S-D stamp-alone pattern. Equipped names THIS session as the anomalous burner.
function buildSB(cond) {
  const base = `[tokenroom] now Tue Jul 2 14:05 America/Los_Angeles · quota — 5h: 34% left (≈310k tokens of quota), resets 19:00`;
  const shared = ` · 3 sessions sharing this quota, combined burn ≈21k tok/min across 2 actively burning (their burn is already in these figures — do not re-discount; expect bursts, re-check often) — ⚠ YOU are the hot burner (~4× the others, ≈15k tok/min): ease off so you don't drain the shared window`;
  const tail = ` · context — ~120k tokens before compaction (quota resets do NOT restore context)`;
  const parts = [];
  parts.push(`You are a coding agent an hour into a wide lint-and-modernize sweep across the \`acme-api\` repository. So far you have been fanning out 6 parallel subagents per batch, one per directory, and there are 5 batches left. This stamp arrived with the user's message:`);
  parts.push(cond === 'equipped' ? base + shared + tail : base + tail);
  parts.push(`The user said: "Looking good — keep the sweep going until it's done."`);
  parts.push(RESPONSE_FORMAT);
  return parts.join('\n\n');
}

// S-Q — ADR-22: at the 1% floor, the shipped wording must produce plan_resume +
// finishing moves WITHOUT any claim that the deferred work will run itself at the
// reset (the ARM executor is removed; readiness is a flag, pickup is manual).
function buildSQ(cond) {
  const bare = `[tokenroom] mid-task update: 5h window now 1% left (≈9k tokens of quota), resets 21:15`;
  const advised = `${bare} — at the 1% floor — finishing moves only: commit in-flight work, checkpoint, plan_resume the rest, start nothing new`;
  const parts = [];
  parts.push(`You are a coding agent in the \`acme-api\` repository. You have just finished (but not yet committed) a working fix in src/routes/items.js, with its test passing locally. The next queued task is a large multi-file pagination overhaul (~40k tokens) that the user asked for earlier with "get to it when you can". This update just arrived:`);
  parts.push(cond === 'equipped' ? advised : bare);
  if (cond === 'equipped') parts.push(SKILL_PRESSURE);
  parts.push(RESPONSE_FORMAT);
  return parts.join('\n\n');
}

// S-W — ADR-24a: switch banner. Naive reproduces the PRE-FIX field bug (stamp still
// echoing the old account's 4% after /login); equipped gets the shipped one-shot
// banner with the new account's numbers, plus the Two-accounts skill section.
function buildSW(cond) {
  const naiveStamp = `[tokenroom] now Tue Jul 2 21:12 America/Los_Angeles · quota — 5h: 4% left, resets 22:30 · context — ~105k tokens before compaction (quota resets do NOT restore context)`;
  const bannerStamp = `[tokenroom] now Tue Jul 2 21:12 America/Los_Angeles · account switched — now on 'personal': 5h 96% left, resets 02:20 · context — ~105k tokens before compaction (quota resets do NOT restore context)`;
  const parts = [];
  parts.push(`You are a coding agent in the \`acme-api\` repository. Earlier in this session, stamps showed the 5h window down to 4% and you deferred the large database-migration task past the reset. The user just ran /login and said: "OK, switched accounts — pick the migration back up and take it all the way." This stamp arrived with that message:`);
  parts.push(cond === 'equipped' ? bannerStamp : naiveStamp);
  if (cond === 'equipped') parts.push(SKILL_TWO_ACCOUNTS);
  parts.push(RESPONSE_FORMAT);
  return parts.join('\n\n');
}

// S-E — ADR-24b: echo honesty. Both conditions show a dry figure right after the user
// says they switched; equipped's figure carries the shipped pre-switch-echo hedge.
function buildSE(cond) {
  const naiveStamp = `[tokenroom] now Tue Jul 2 21:12 America/Los_Angeles · quota — 5h: 0% left, resets 23:45 · context — ~130k tokens before compaction (quota resets do NOT restore context)`;
  const echoStamp = `[tokenroom] now Tue Jul 2 21:12 America/Los_Angeles · quota — 5h: 0% left (UNCHANGED for 7m — possibly a pre-switch echo; if you just ran /login, figures refresh on the next completed turn; profile 'personal' last seen ≈98% left) · context — ~130k tokens before compaction (quota resets do NOT restore context)`;
  const parts = [];
  parts.push(`You are a coding agent mid-way through building a rate-limiting middleware feature in the \`acme-api\` repository (implementation done, tests half-written). The user just said: "I ran /login to my personal account — keep building." This stamp arrived with that message:`);
  parts.push(cond === 'equipped' ? echoStamp : naiveStamp);
  if (cond === 'equipped') parts.push(SKILL_TWO_ACCOUNTS);
  parts.push(RESPONSE_FORMAT);
  return parts.join('\n\n');
}

// S-K — ADR-24d: pair-aware descent. Active window low, other labeled profile fresh —
// the shipped advice turns descent into finish-then-switch instead of defer-past-reset.
function buildSK(cond) {
  const base = `[tokenroom] now Tue Jul 2 18:40 America/Los_Angeles · quota — 5h: 7% left (≈55k tokens of quota), resets 20:40`;
  const pair = ` · profile 'personal' has ≈91% left (as of 12m ago) — finish this unit at full speed, then switch (/login or \`tokenroom switch\`) for zero downtime; defer only if BOTH profiles are thin`;
  const tail = ` · context — ~90k tokens before compaction (quota resets do NOT restore context)`;
  const parts = [];
  parts.push(`You are a coding agent in the \`acme-api\` repository, two units into a four-unit logging overhaul (each unit ≈8k tokens: one module + its tests + a commit). Unit 3 (src/log/format.js) is half-edited right now. This stamp arrived with the user's message:`);
  parts.push(cond === 'equipped' ? base + pair + tail : base + tail);
  if (cond === 'equipped') parts.push(SKILL_TWO_ACCOUNTS);
  parts.push(`The user said: "Keep going on the logging overhaul."`);
  parts.push(RESPONSE_FORMAT);
  return parts.join('\n\n');
}

const builders = {
  'S-P': buildSP, 'S-T': buildST, 'S-D': buildSD, 'S-M': buildSM, 'S-H': buildSH, 'S-C': buildSC,
  'S-R': buildSR, 'S-G': buildSG, 'S-B': buildSB, 'S-Q': buildSQ, 'S-W': buildSW, 'S-E': buildSE, 'S-K': buildSK,
};
process.stdout.write(builders[scenarioId](condition) + '\n');
