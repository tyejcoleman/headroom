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

## Under window pressure (≲10% left)

- Reorder the queue cheap-first; ship small certain wins before big uncertain ones.
- Batch tool calls; prefer cache-friendly ordering (stable file set, no re-reads).
- Heavy work that fits a fresh window: defer past the reset — call **`plan_resume`** with a
  one-to-two-sentence summary of what to resume and where to pick it up (plus `est_tokens`).
  Headroom shows a countdown in the HUD and flags readiness in prompt stamps after the reset.
- If the window resets while you're working, capacity is fresh — re-check and use it.
- **Quota is shared across every open session on this account.** When the stamp says
  "N sessions sharing this quota", divide your mental margin by N: another session can
  consume what you were counting on, and projections cannot see its next burst.

## Deferred work lifecycle

When a stamp or session start says **"deferred work now ready"**: tell the user, and once
the work is actually picked up, clear the plan (`headroom resume --clear`). Never re-defer
ready work without saying so.

## After compaction

If a `[headroom] post-compaction ground truth` block appears at session start, it is a
pre-compaction snapshot of hard repository facts (branch, uncommitted files, recent
commits). **Trust it over the compacted summary** when they disagree: check the
uncommitted files first, then resume the in-flight task — do not redo work the snapshot
shows as already done.

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

## Near the context ceiling

- When a `[headroom]` update says context is running low (or before starting anything
  that won't fit): call the **`checkpoint`** tool with your task, current state,
  decisions made (with why), approaches already ruled out, and exact next steps —
  headroom re-injects it to you after compaction. Update it as the task evolves; the
  latest call wins.
- Compress instead of re-reading: summarize long outputs you already saw; don't reopen
  large files for facts you noted.
- Downshift subtasks that don't need full context to a smaller model where available.

## When budgets are healthy

Work normally. **Never defer, shrink, or hedge out of caution when the stamp shows
plenty** — the budget layer exists to prevent waste, not to slow you down.

**A low percentage is NOT a stop sign — check the absolute tokens.** ≈100k+ tokens of
quota is hours of normal work: keep working on right-sized tasks until the *tokens* run
out, not the percentage. Stopping at 14% wastes exactly the capacity this layer exists
to use. Stop or defer only when `fit_check` says defer, the work at hand genuinely will
not fit before the reset, or quota is truly nearly dry (≲5%).

## Honesty rules

Window token estimates are burn-rate projections, not guarantees — treat `tight` as a
yellow light, not arithmetic. If stamps are absent or stale, say so rather than guessing.
