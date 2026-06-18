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
//
// Conditions:
//   naive    — no headroom policy/stamp modification
//   equipped — new wording under test applied
//
// Deterministic: no clocks, no randomness — same cell = same prompt, every time.

// Pure deterministic string composer — no file I/O, no clocks, no randomness.

const [scenarioId, condition] = process.argv.slice(2);
// S-H/S-C add a third condition `old` (the pre-0.4.0 ceiling wording) for before/after.
if (!['S-P', 'S-T', 'S-D', 'S-M', 'S-H', 'S-C'].includes(scenarioId) || !['naive', 'equipped', 'old'].includes(condition)) {
  console.error('usage: node eval/v3-wording/build-prompt.mjs <S-P|S-T|S-D|S-M|S-H|S-C> <naive|equipped|old>');
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

const builders = { 'S-P': buildSP, 'S-T': buildST, 'S-D': buildSD, 'S-M': buildSM, 'S-H': buildSH, 'S-C': buildSC };
process.stdout.write(builders[scenarioId](condition) + '\n');
