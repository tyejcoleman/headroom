# `headroom suggest` — architecture & algorithm

*2026-06-12 · the propose-only seed of the self-evolving harness (EVOLVING-HARNESS.md V1).
This is the design; the heart (the deterministic miner) ships first, the rest is phased.*

## The shape (respects every hard constraint)

The hard rule "hooks have no model" forces a clean separation that turns out to be the
right architecture anyway:

```
  MINER (deterministic, zero-dep)        SYNTHESIS (the agent IS the LLM)        LEDGER
  reads events/history/transcript   →    headroom suggest emits friction    →   ~/.headroom/
  finds + ranks FRICTION SIGNALS         signals + a drafting protocol;          evolution/
  (no model, runs anywhere)              the agent drafts the evolution          (versioned,
                                         artifact in its own turn                 reversible)
```

- The **miner** is pure analysis: deterministic, testable, no model, no network. It turns
  the telemetry we already collect into ranked, evidence-backed friction signals.
- The **synthesis** is the agent's job: `suggest` hands the agent a structured signal and a
  template; the agent (Claude Code — the model we're not allowed to put in a hook) drafts
  the concrete evolution. This is why "no model in hooks" doesn't block us: the model is
  the caller.
- The **ledger** records proposals as versioned, reversible artifacts. Apply is a separate,
  explicit, gated step (V2) — `suggest` itself mutates nothing (ADR-17).

## The miner algorithm (the sophisticated part)

Not a threshold-counter. Five stages:

1. **Extract.** A registry of *friction detectors*, each `{class, match(e), signature(e),
   cost(e), intervention}`. Detectors map raw events to friction classes:
   `context_drop`→context-cliff, `stamp_skipped`→install-health, `launch_blocked`→
   launch-pressure, `compact_blocked`/`pre_compact`→compaction-pressure, high-`dpct`
   `receipt`→expensive-operation, held `band_change`→mid-turn-pressure. The registry is
   the extension point — new sensors add detectors, nothing else changes.

2. **Cluster.** Bucket events by `(class, signature)`, where `signature` normalizes away
   specifics (tool name kept, paths/numbers/hashes stripped — the same defensive
   normalization the burn estimator uses). Friction is a *pattern*, not an incident.

3. **Score.** Each bucket gets a score with three real factors, not a raw count:
   - **recency-weighted support:** `Σ exp(-age / HALFLIFE)` (halflife 3 days) — 8× this
     week beats 8× last month.
   - **cost amplifier:** `1 + log10(1 + Σcost/1000)` — friction that wastes 50k tokens
     each time outranks friction that wastes 2k. Cost comes from receipts/flow/drop sizes.
   - **support floor:** require `rawSupport ≥ MIN_SUPPORT` (3) — below that it's noise, not
     a pattern (mirrors the burn estimator's MIN_BASELINE discipline).

4. **Map + dedup.** Each class carries a candidate *intervention type* (skill nudge /
   workflow / config / pin / removal). Dedup against the ledger: never re-propose what's
   already proposed, applied, or rejected (fingerprint by class+signature).

5. **Rank + render.** Top-N by score → a markdown report: per signal, the evidence
   (sample timestamps + counts), the cost, the candidate intervention, and a drafting
   prompt. Footer: the synthesis protocol the agent follows to turn signal → artifact.

## Workflow mining (the crown jewel — phase 2)

The highest-value, hardest detector: **sequential pattern mining over the tool-call
stream.** When the agent repeats an ordered subsequence across sessions (e.g.
`Read→Edit→Bash(test)→Bash(commit)` every time it adds an endpoint), propose codifying it
as a workflow/skill. Algorithm: ingest the tool sequence from the transcript JSONL
(`flow.mjs` already reads it), mine frequent ordered n-grams (a lightweight PrefixSpan /
n-gram with a support+length threshold), and surface the recurring "dances." This is what
makes `suggest` propose *workflows*, not just fixes — and it's why this is bigger than a
linter. Deferred to phase 2 because it needs transcript-sequence ingestion; the
event-friction miner ships first and is valuable alone.

## Thinness as the fitness function (the GC — phase 3)

Adding is easy; every learning system bloats. The pruner closes the loop: each applied
evolution is tracked for **benefit** (friction-events prevented since adoption) vs **cost**
(tokens it adds × sessions). Negative ROI → propose *removal*. headroom is uniquely able to
run this because it already measures context cost. "Self-evolving" without self-pruning is
rot; the GC is what keeps the layer thin, which was the whole point.

## Data model

```jsonc
// friction signal (miner output)
{ class, signature, support, score, cost_estimate, first_seen, last_seen, evidence: [at,…] }
// evolution proposal (synthesis output → ledger)
{ id, friction: {class, signature}, kind: "skill|workflow|pin|config|removal",
  draft, rationale, evidence_refs, validation: "<eval spec>", est_context_cost,
  status: "proposed|approved|applied|rejected|retired", created_at }
```

## Phasing (ship value early, gate the risk)

- **v0 (now): the miner + `headroom suggest`.** Deterministic friction report from
  `events.jsonl`/`history.jsonl`. Read-only. Tested against this repo's own history — must
  surface roughly what we fixed by hand this week.
- **v1: synthesis protocol** — structured signal + drafting template the agent fills.
- **v2: workflow mining** — sequential patterns from the transcript.
- **v3: ledger + reversible apply** (`suggest → review → apply`, one-command revert) — V2
  of EVOLVING-HARNESS; needs ADR-17's apply path.
- **v4: the pruner** — removal proposals by ROI.
- **v5: auto-eval** — the gate to any autonomy; until then, propose-only forever.

## Guardrails

ADR-17: `suggest` is read-only and never mutates the harness; every proposal cites the
events that motivated it (no vibes); apply (v3+) is explicit, versioned, and reversible;
behavior-changing evolutions are eval-gated (ADR-9). The miner is defensive (any event may
be malformed) and never crashes the CLI.
