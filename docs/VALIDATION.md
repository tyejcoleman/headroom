# Headroom — Validation harness

**v0.1 · the "should we build the whole thing?" gate**

The architecture in `ONE-PAGER.md` is sound *if* two assumptions hold. Both are cheap to
test and expensive to be wrong about. Validate them before building the five-phase
monorepo. This doc is the process for doing that, and the decision gates that follow.

## The two load-bearing assumptions

### A1 — The data actually exists, on real accounts, reliably

> Claude Code's statusline stdin JSON carries `rate_limits` (`five_hour` / `seven_day`,
> each with `used_percentage` 0–100 and `resets_at` epoch) **and** `context_window`
> (`context_window_size`, `used_percentage`, usage breakdown) — present and stable enough
> to plan against.

Everything downstream (state file, MCP, stamp, skill) is worthless if this field isn't
there or isn't trustworthy. The one-pager claims it appears in Claude Code ≥ v2.1.80 on
Pro/Max after the first API response. **This must be confirmed empirically on a real
account — it cannot be assumed from docs**, because it's gated by plan, version, and timing.

**Test: Spike S0.** `spikes/s0-dump-statusline.mjs` is a throwaway statusline command that
appends the raw stdin payload to `~/.headroom/raw-sample.json` and prints a one-line HUD
showing whether each field is present. Register it temporarily, use Claude Code normally
for a few prompts across a session, then inspect the captured samples.

```bash
# 1. Register (or use /statusline and point it at this file):
#    "statusLine": { "type": "command", "command": "node /Users/taikicoleman/Development/headroom/spikes/s0-dump-statusline.mjs" }
# 2. Use Claude Code normally for ~5 prompts.
# 3. Inspect:
cat ~/.headroom/raw-sample.json | tail -3
```

**Success:** `rate_limits` and `context_window` are present, with sane `used_percentage`
(0–100) and a future `resets_at`, on this Pro/Max account at v2.1.170.
**Watch for:** field absent on first prompt then appearing; epoch values leaking into
`used_percentage`; `rate_limits` missing entirely (API-key auth).
**Kill/pivot:** if `rate_limits` never appears → rate-limit awareness degrades to
JSONL-based *estimation* only (still useful, but reframe the pitch around context
headroom + estimated burn, not authoritative window %). If `context_window` is also
absent → stop; the thesis doesn't stand on official surfaces.

### A2 — Feeding headroom to the model actually improves its planning

> Injecting a ~40-token headroom stamp (and exposing `fit_check` via MCP) measurably
> changes the agent's behavior for the better — it scopes/sequences work to fit — and the
> awareness layer costs less context than it saves.

This is the real bet. A stamp the model ignores, or one that makes it timid, is a net
loss. There's also irony to watch for: a context-headroom tool that itself eats context.

**Test: Spike S1 (only after S0 passes).** Minimal `tap` + `UserPromptSubmit` stamp + a
3-task eval queue under a deliberately constrained window. Compare naive vs.
Headroom-equipped on: did it reorder cheap-first under pressure? right-size / split the
over-budget task? avoid a 429 it would otherwise hit? Net tokens spent including the
stamp overhead.

**Success:** equipped run reorders and right-sizes *unprompted* (mirrors PLAN T1.3 AC) and
net context/quota spend is ≤ naive.
**Kill/pivot:** if behavior doesn't change → the lever is the **skill**, not the data;
iterate `SKILL.md` wording before adding machinery. If it changes for the worse →
make the stamp terser / opt-in and lean on pull (`fit_check`) over push.

### A3 — (secondary) Compaction survival preserves continuity

The highest-value, hardest feature (PLAN T2.2). Worth a dedicated continuity eval once
S0/S1 pass, but it is not a go/no-go gate for the project — it's the headline feature
*if* the foundation holds.

## Decision gates

| Gate | Pass → | Fail → |
|---|---|---|
| **G0** S0: data exists | Build Phase 0 (tap + schema + state) for real | Pivot to estimation-only or stop (see A1) |
| **G1** S1: stamp helps | Build Phase 1 connector + invest in the skill | Iterate skill wording before building machinery |
| **G2** Continuity eval | Prioritize T2.2 as the headline feature | Ship awareness without compaction survival |

## Why this order

The riskiest, cheapest-to-test assumption goes first. S0 is ~20 lines and zero API cost;
it settles the question the entire repo depends on in one session of normal use. Don't
build `packages/` until G0 is green.
