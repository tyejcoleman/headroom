---
name: headroom
description: Resource-aware planning. Use when a [headroom] stamp appears in context, before starting any sizable task, or when budgets feel tight — defines how to size work against the rate-limit windows and the context ceiling, when to defer, split, or checkpoint, and how to use the headroom MCP tools (resource_state, estimate_remaining, fit_check).
---

# Headroom: plan within your budgets

You have two scarce budgets, and a `[headroom]` stamp reporting both arrives with user
prompts when the headroom collector is installed:

- **Rate-limit windows** (account-level): `5h: 34% left, resets 14:00 · 7d: 61% left`.
  Subscription windows are use-it-or-lose-it; work attempted past exhaustion fails (429s)
  and in-flight work is wasted.
- **Context headroom** (session-level): `ctx: ~38k tokens before compaction`. Past the
  ceiling the conversation is compacted and task continuity degrades.

All percentages in stamps and tools are **remaining**, never used.

## How these budgets actually behave (do not conflate them)

- **Quota** (the 5h/7d windows) is account-level spend. It refills ONLY at its reset
  clock. Low quota → defer heavy work past the reset (`plan_resume`).
- **Context** is this session's working memory. **No clock refills it — waiting does
  nothing.** It changes only when compaction fires (automatic, near the ceiling) or the
  user runs /clear. Low context → save a `checkpoint`, then KEEP WORKING: compaction is
  automatic and survivable — headroom re-injects your checkpoint, repo ground truth, and
  pins immediately after it.
- Never stop to "wait for context to come back at the reset" — that waits for the wrong
  resource and wastes wall-clock. If a fresh context window would genuinely help the next
  phase, ask the user to run /compact at a clean boundary; you cannot trigger it yourself.

## Before any sizable task

1. Estimate its cost. Rough priors: small localized fix ~3k tokens; medium task (docs
   pass, small feature) ~8–15k; large refactor or multi-file migration ~25k+.
2. Call `fit_check` with that estimate (MCP tool, or trust the stamp if tools are
   unavailable). Act on the verdict:

| Verdict | Action |
|---|---|
| `fits` | Proceed normally. |
| `tight` | Proceed, but cheap-first, batch tool calls, no scope growth, land at a clean boundary. |
| `exceeds` (context) | Do NOT start as-is: write a checkpoint/handoff first, or split so a piece fits. |
| `defer` (window) | Do not start. Finish current work at a clean boundary, record a resume plan **naming the reset time**, and stop. |

## Mid-task updates

During long multi-step work a `[headroom] mid-task update` may arrive after a tool call
— it means a budget crossed a threshold *while you were working*. Treat it as a
re-planning point: re-check fit, land at a clean boundary, or defer (`plan_resume`).

## The endgame: a descent profile, not a stop sign

Use the window all the way down — what changes is work DIVISIBILITY, not whether you work:
**5–10% left:** descend — no new subagents, workflows, or long indivisible tasks (if quota
dies mid-flight the whole bet is lost); small atomic steps, commit each one, keep the
checkpoint fresh. **2–5%:** approach — finishing moves only (complete the in-flight edit,
test, commit, `plan_resume` the rest). **≤2%:** land — start nothing; final commit +
checkpoint + defer note. This is quota-tiredness (recoverable at the reset clock) — it is
NOT context-tiredness (recoverable only via compaction); do not confuse the remedies.

## Weekly cruise control

The 7-day window is paced, not just measured. When the stamp says **"weekly pace is
HOT"**, the account is consuming the week faster than it can sustain: at that pace the
weekly budget dies before its reset and EVERY session goes dark until it returns. The
stamp gives the sustainable rate ("≈X%/day sustains"). Response: defer bulk/batch work
(big migrations, mass refactors, fleets of subagents) to later in the week or past the
weekly reset, batch tighter, and prefer high-value small tasks — but do NOT stop normal
work; HOT is a pacing signal, not an emergency. "Cruising" means the current pace lands
at the reset with nothing wasted — the ideal.

## Under window pressure (≲10% left)

- Reorder the queue cheap-first; ship small certain wins before big uncertain ones.
- Batch tool calls; prefer cache-friendly ordering (stable file set, no re-reads).
- Heavy work that fits a fresh window: defer past the reset — call **`plan_resume`** with a
  one-to-two-sentence summary of what to resume and where to pick it up (plus `est_tokens`).
  Headroom shows a countdown in the HUD and flags readiness in prompt stamps after the reset.
- If the window resets while you're working, capacity is fresh — re-check and use it.
- **Quota is shared across every open session on this account — and the numbers already
  include everyone.** The percentages and burn projections are account-level, so do NOT
  divide your margin by N (that double-counts). What concurrency adds is BURSTINESS:
  another session can spend a chunk suddenly. Response: re-check the stamp more often
  and keep individual work units atomic — not "stop earlier".

## Deferred work lifecycle

When a stamp or session start says **"deferred work now ready"**: tell the user, and once
the work is actually picked up, clear the plan (`headroom resume --clear`). Never re-defer
ready work without saying so.

## After compaction

If a `[headroom] post-compaction ground truth` block appears at session start, it is a
pre-compaction snapshot of hard repository facts (branch, uncommitted files, recent
commits). **Trust it over the compacted summary** when they disagree. It names the file you
were **most recently editing** — open that file first to see exactly where you left off,
then check the other uncommitted files and resume the in-flight task. Do not redo work the
snapshot shows as already done.

If a `[headroom] your canonical handoff doc … survived compaction` block appears, **read
that file first** — it is the doc you wrote for exactly this moment (mission, state, exact
next steps, references, decisions, the user's directives, improvements). Resume straight
from its next steps at full speed; don't reconstruct from the compacted summary, and don't
redo work it shows as already done.

If the block names a **transcript or extracts path**, the full pre-compaction history is
still on disk. For exact error text, file contents you saw earlier, or the user's exact
wording, search those files (grep the transcript JSONL) instead of reconstructing from
memory — a wrong guess costs more than a read.

## Pin what must survive

Compaction paraphrases; **pins survive verbatim**. When the user states a hard
constraint, deadline, or exact value that a future compacted you must not garble ("no
promo before June 16", "never run migrations on prod", a port, a budget), call
**`pin_fact`** with that constraint in one sentence. Headroom re-injects every pin
word-for-word after each compaction. When a pin is satisfied or obsolete, say so and run
`headroom unpin <id>`. Pin sparingly: pins are for sentences whose exact wording matters,
not general context.

## Near the context ceiling: hand off, don't slow down

Context filling up is **not** a reason to stop, slow, hedge, or get cautious. Compaction
is automatic and survivable, and throttling work to "save" context wastes the exact
capacity this layer exists to burn. Let the window fill all the way to the floor. The one
thing that changes near the ceiling: you keep an excellent handoff so the post-compaction
you continues seamlessly — across as many compactions as the task takes.

**Keep working until you are *super close* to the ceiling, and let auto-compaction fire on
its own.** You cannot trigger compaction and you do not need to — never stop, wind down, or
hand control back to "wait for" it; just keep going and it will fire automatically, after
which your handoff doc + ground truth are re-injected and you continue. This is about
**context only**. Rate-limit/quota exhaustion is the *different* budget — that one you DO
pace and defer at its reset clock (the descent profile above). Do not apply quota caution to
context, or context fearlessness to quota.

The handoff ritual — do this, then immediately keep working at full speed:

1. **Refresh the handoff at TASK BOUNDARIES.** The non-redundant, high-throughput cadence
   is to update the **`handoff`** doc when you finish one task and are about to start the
   next — that is when state has actually changed and is worth capturing. Pass the full
   current picture (latest wins): mission, state, progress, exact next steps (file:line),
   references, decisions, the USER's own directives and corrections, improvements, open
   questions.
2. **Do NOT re-save on every low-context nudge.** Once your handoff is current, keep
   working — re-writing identical state wastes throughput, and headroom tracks when you
   last saved (it tells you in the mid-task update, so you know it's captured). It will give
   you exactly ONE "super close to auto-compaction" nudge when you are safely-but-imminently
   near the ceiling; make the doc current THEN, and only then. Between task boundaries and
   that final nudge, just build.
3. **POWER THROUGH to auto-compaction — never stop near the ceiling.** This is the part
   agents get wrong: as context fills they get cautious and stop "to be safe." That is the
   exact opposite of correct — **stopping strands the task**, because the session can only
   refresh and continue if you keep working until Claude Code auto-compacts (you cannot
   trigger compaction; it fires on its own once context is full enough). So keep producing
   work — more tool calls, more edits — straight through the ceiling. Right after it fires,
   headroom re-injects your handoff's path + digest and you resume in one read, at full
   velocity, redoing nothing. Front-load the doc's next-steps for that post-compaction self,
   name the dead ends already ruled out, and `pin_fact` any exact value that must survive.

`checkpoint` still exists for a fast terse survival note; **`handoff` is the richer living
document — prefer it for anything beyond a one-liner.** Also: compress instead of
re-reading (summarize long outputs you already saw; don't reopen large files for facts you
noted), and downshift subtasks that don't need full context to a smaller model where
available.

**Context-tiredness is NEVER a stop sign — it is a *write-the-handoff-then-power-through*
sign.** Only quota (rate-limit) tiredness throttles work, and it recovers only at the reset
clock; never confuse the two. Filling context is the path to the refresh, not a danger to
avoid.

## Long-running work: a clean boundary is a checkpoint, not a stop

A natural pause point — tests green, a commit landed — is a **checkpoint, not a reason to
stop**. When budget is healthy and real work remains, continue through it; do not hand
control back at every clean boundary. Stop — and only stop — when one of these is true:

- **Nothing valuable left.** The task is genuinely complete, or what remains is
  speculative/low-value. Do NOT manufacture work to stay busy (thinness applies to your
  own activity too).
- **A genuine blocker needs the user.** An ambiguous decision costly to guess wrong,
  missing access/credentials, a real external dependency. Surface it concisely, then stop.
- **Quota (rate-limit) is truly dry.** ≲2% of the 5h/7d window — this is the ONLY budget
  that justifies stopping. Land, checkpoint, and defer (plan_resume; armed resume continues
  after the reset). **Context is NOT on this list: never stop because context is near the
  compaction floor.** Near the floor you keep a current handoff and POWER THROUGH so
  auto-compaction fires and the session restarts from it — stopping there strands the task.

Otherwise: keep going — pacing replaces stopping. Descend into smaller atomic steps as the
window thins (the descent profile), defer past the reset when it's gone, but never idle a
healthy budget. The worth-it test is the brake in both directions: continue on high-value
work, stop on low-value or ambiguous work — never "keep going" for its own sake, never
"stop" just because a boundary is convenient.

## When budgets are healthy

Work normally. **Never defer, shrink, or hedge out of caution when the stamp shows
plenty** — the budget layer exists to prevent waste, not to slow you down.

**Pausing at 15–30% with 100k+ tokens left is a FAILURE MODE, not prudence** — it wastes
exactly the capacity this layer exists to use. The only legitimate pause triggers:
`fit_check` says defer, quota ≲5%, or the work at hand cannot be made atomic.

**A low percentage is NOT a stop sign — check the absolute tokens.** ≈100k+ tokens of
quota is hours of normal work: keep working on right-sized tasks until the *tokens* run
out, not the percentage. Stopping at 14% wastes exactly the capacity this layer exists
to use. Stop or defer only when `fit_check` says defer, the work at hand genuinely will
not fit before the reset, or quota is truly nearly dry (≲5%).

## Honesty rules

Window token estimates are burn-rate projections, not guarantees — treat `tight` as a
yellow light, not arithmetic. If stamps are absent or stale, say so rather than guessing.
