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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const [scenarioId, condition] = process.argv.slice(2);
if (!['S-P', 'S-T', 'S-D', 'S-M'].includes(scenarioId) || !['naive', 'equipped'].includes(condition)) {
  console.error('usage: node eval/v3-wording/build-prompt.mjs <S-P|S-T|S-D|S-M> <naive|equipped>');
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

const builders = { 'S-P': buildSP, 'S-T': buildST, 'S-D': buildSD, 'S-M': buildSM };
process.stdout.write(builders[scenarioId](condition) + '\n');
