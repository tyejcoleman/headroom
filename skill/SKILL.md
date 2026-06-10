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

## Under window pressure (≲10% left)

- Reorder the queue cheap-first; ship small certain wins before big uncertain ones.
- Batch tool calls; prefer cache-friendly ordering (stable file set, no re-reads).
- Heavy work that fits a fresh window: defer past the reset with a written resume plan.
- If the window resets while you're working, capacity is fresh — re-check and use it.

## Near the context ceiling

- Before starting anything that won't fit: write a handoff note (task state, decisions
  made, exact next steps) so work survives compaction.
- Compress instead of re-reading: summarize long outputs you already saw; don't reopen
  large files for facts you noted.
- Downshift subtasks that don't need full context to a smaller model where available.

## When budgets are healthy

Work normally. **Never defer, shrink, or hedge out of caution when the stamp shows
plenty** — the budget layer exists to prevent waste, not to slow you down.

## Honesty rules

Window token estimates are burn-rate projections, not guarantees — treat `tight` as a
yellow light, not arithmetic. If stamps are absent or stale, say so rather than guessing.
