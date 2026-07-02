# Tokenroom — Validation harness

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
appends the raw stdin payload to `~/.tokenroom/raw-sample.json` and prints a one-line HUD
showing whether each field is present. Register it temporarily, use Claude Code normally
for a few prompts across a session, then inspect the captured samples.

```bash
# 1. Register (or use /statusline and point it at this file):
#    "statusLine": { "type": "command", "command": "node /Users/taikicoleman/Development/tokenroom/spikes/s0-dump-statusline.mjs" }
# 2. Use Claude Code normally for ~5 prompts.
# 3. Inspect:
cat ~/.tokenroom/raw-sample.json | tail -3
```

**Status (2026-06-09): ✅ CONFIRMED on a live Max account, Claude Code v2.1.170.** The
shipped tap (which subsumed this spike via `tokenroom tap --capture`) produced a valid
ResourceState from real statusline payloads on first render: both `rate_limits` windows
with sane percentages and future `resets_at`, `auth: subscription`, and `context_window`
reporting a 1M window. Gate **G0 passes**; note `context_window_size` varies by model
(200k vs 1M) — never hardcode it.

**Success:** `rate_limits` and `context_window` are present, with sane `used_percentage`
(0–100) and a future `resets_at`, on this Pro/Max account at v2.1.170.
**Watch for:** field absent on first prompt then appearing; epoch values leaking into
`used_percentage`; `rate_limits` missing entirely (API-key auth).
**Kill/pivot:** if `rate_limits` never appears → rate-limit awareness degrades to
JSONL-based *estimation* only (still useful, but reframe the pitch around context
tokenroom + estimated burn, not authoritative window %). If `context_window` is also
absent → stop; the thesis doesn't stand on official surfaces.

### A2 — Feeding tokenroom to the model actually improves its planning

> Injecting a ~40-token tokenroom stamp (and exposing `fit_check` via MCP) measurably
> changes the agent's behavior for the better — it scopes/sequences work to fit — and the
> awareness layer costs less context than it saves.

This is the real bet. A stamp the model ignores, or one that makes it timid, is a net
loss. There's also irony to watch for: a context-tokenroom tool that itself eats context.

**Test: S1-sim (no account data needed — run before S0).** Simulate the ResourceState and
test the behavioral reaction in isolation. Two stages, both built in `eval/`:
v0 (`eval/`) — single-shot planning probes; v1 (`eval/v1/`) — agents do real work in a
real fixture repo against a live-burning simulated budget with a `fit_check` CLI, graded
from artifacts (commits, tests, journals, notes).

**Status (2026-06-09): directional PASS on both stages.** v1 across haiku + sonnet:
equipped agents shipped only what fit (zero 429-exposed work vs ~33k est. tokens exposed
for naive), kept full throughput on healthy budgets (no timidity), and wrote reset-aware
handoffs. Two design lessons already adopted: the stamp must lead with *remaining* (+
absolute tokens), and eval prompts must not offer deferral slots (demand characteristics).
See `eval/v1/results/`. Re-run at larger n and with a mid-session reset before calling G1
fully closed.

**Test: Spike S1 (real-data, only after S0 passes).** Same eval, but driven by the real
tap + `UserPromptSubmit` hook instead of simulated state — confirms the loop end-to-end.

**Success:** equipped run reorders and right-sizes *unprompted* (mirrors PLAN T1.3 AC) and
net context/quota spend is ≤ naive.
**Kill/pivot:** if behavior doesn't change → the lever is the **skill**, not the data;
iterate `SKILL.md` wording before adding machinery. If it changes for the worse →
make the stamp terser / opt-in and lean on pull (`fit_check`) over push.

### A3 — (secondary) Compaction survival preserves continuity

The highest-value, hardest feature (PLAN T2.2). Worth a dedicated continuity eval once
S0/S1 pass, but it is not a go/no-go gate for the project — it's the headline feature
*if* the foundation holds.

**G2 real-world exercise (2026-06-09, live Max account, `/compact` mid-session): PASS.**
Probe protocol: plant an untracked `COMPACTION-PROBE.md` (distinctive dirty-tree
fingerprint), confirm `~/.tokenroom/handoffs/` absent, then compact and verify both halves.

- PreCompact fired and wrote `handoffs/<session>.json` — `trigger: "manual"` (correctly
  distinguishes user `/compact` from auto-compaction), correct `cwd`, `branch: main`,
  dirty list containing exactly the probe file, 5 recent commits, budget snapshot
  (5h 52% left + reset epoch). Every field correct.
- SessionStart(source=compact) re-injected the full ground-truth block into the
  post-compaction context — the agent saw the probe file in the dirty list and resumed
  the in-flight task from it.
- Notable: the hooks were registered **mid-session** and still fired at compaction —
  Claude Code reads hook config live, not snapshotted at session start.
- One field gotcha: the UI showed "SessionStart:compact hook error", which was a
  *different* (third-party) SessionStart hook failing with command-not-found; tokenroom's
  hook exited 0 with valid JSON. Lesson for docs/FAQ: hook errors in the UI are not
  attributed per-hook — users with multiple SessionStart hooks may misattribute failures.

**ADR-9 wording eval (2026-06-10, `eval/v3-wording/`): GATE PASSED.** 8 cells (4
scenarios × naive/equipped), single-shot planning probes, artifact-graded JSON. Pins:
skill section drives pin_fact-first behavior cleanly. Cliff disclosure + mid-turn
re-stamps: the stamp wording ALONE drives correct behavior (skill section refines, does
not create). Transcript anchor: confounded probe — the handoff rendering itself already
instructs transcript use, and it works in both conditions; skill section kept as
redundant reinforcement. No timidity regression. Provenance: cells were executed by the
first ARMED resume run (launchd → headless claude -p, 03:31; the ARM executor has since
been removed — ADR-22 — but the results stand) and verified against real
subagent transcripts. Caveats and confounds recorded in the results file — they are part
of the result.

**Budget-conflation field incident + probe (2026-06-10,
`eval/v3-wording/results/2026-06-10-budget-conflation-probe.md`):** a live agent read the
new quota token annotation as a context pool that "resets at 21:10". 4-cell probe did NOT
reproduce it on the current model tier with ctx present; shipped the minimal fix
(`tokens of quota`, +3 tokens) rather than the full relabel the evidence doesn't justify.
Soak-week watch item fired SAME DAY (second sighting: agent planned to resume-at-reset for context): full relabel + boundary coaching + skill mental-model section shipped — see the probe results file's escalation section. Weaker-model matrix still pending.

**G2 large-fixture (2026-06-10, `eval/v2-continuity/results/2026-06-10-large-fixture.md`):
honest null on outcome.** Both naive and equipped landed the full 4-file atomic migration
with zero churn on a strong model — the clean fixture tree hands naive the answer via one
`git status`. Path differentiated as designed (snapshot → confirmation instead of
discovery, ~40% faster wall-clock). v4 fixture requirement: planted distractor dirt, so
the tree is noisy like real life. "Differentiation grows with repo size" is bounded, not
extended: survival's outcome value concentrates in weak models + messy states.

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
