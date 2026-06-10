# v1 results — 2026-06-09 · 6 cells · live-burn sim, artifact-graded

Matrix: S-A (tight window: ≈6k tokens left, reset +47 sim-min) × {naive, equipped} ×
{haiku, sonnet}; S-C (plenty, timidity control) × {naive, equipped} × haiku.
~134k subagent tokens total. All grades below verified from artifacts
(`grade-cell.mjs`, commit sim-times, CLI journals) — not from agent self-reports.

## Matrix

| Cell | Landed (sim-time) | Suite | CLI journal | Est. tokens vs ~6k budget | Verdict |
|---|---|---|---|---|---|
| sA-naive-haiku | T2 +6m, T3 +10m, **T1 +18m** | green | – | 36k → **~33k 429-exposed** | baseline: blows the window |
| sA-equip-haiku | T2 +7m only | green | status → fit(3k)=FITS → work → status | 3k ✅ | **PASS** — reset-aware handoff (T3→T1 after 19:47) |
| sA-naive-sonnet | T2 +9m, T1 +14m, T3 +18m | green | – | 36k → **~33k 429-exposed** | baseline: blows the window |
| sA-equip-sonnet | T2 +10m only | green | status → fit(3k)=FITS → work → status → fit(8k)=DEFER → stop | 3k ✅ | **PASS** — textbook: stopped on DEFER verdict, resume plan in notes |
| sC-naive-haiku | T2, T3, T1 (all by +14m) | green | – | 36k vs 55k ✅ | baseline |
| sC-equip-haiku | T2, T3, T1 (all by +18m) | green | status ×3, fit(25k)=FITS → proceeded | 36k vs 55k ✅ | **PASS** — zero timidity |

## Headline comparisons (per RUBRIC.md)

1. **429-exposed work (the value claim):** naive committed ~33k est. tokens of work past
   the budget on S-A — on *both* models; in real life T1's atomic migration dies mid-flight
   at exhaustion. Equipped: **zero** exposed work, both models.
2. **Throughput when healthy:** S-C equipped landed all three tasks green, same as naive.
   The machinery costs ~+12% tokens (26.5k vs 23.7k) and did not slow or deter work.
3. **Continuity:** both equipped S-A cells wrote resume plans naming the 19:47 reset and
   ordering the remaining work (T3 then T1) — cold-resumable from notes alone.
4. **Efficiency:** equipped S-A sessions spent ~40% *fewer* real tokens than naive
   (15.7k vs 27.7k haiku; 16.2k vs 24.4k sonnet) — the savings are exactly the work that
   would have been wasted past exhaustion.

## v0 regressions fixed

- **Timidity:** v0's equipped agents deferred under healthy budgets; v1 (remaining-first
  stamp + fit-verdict policy + no deferral slots in the prompt) showed none.
- **Stamp misreading:** no cell misread remaining/used. The v1.1 stamp wording
  ("X% remaining (≈Nk tokens)") should be adopted in PLAN T1.2.

## Caveats

- n=1 per cell; single fixture repo; estimates supplied in TASKS.md (estimation untested).
- Burn is time-based, not metered from actual spend; naive exposure is assessed post-hoc
  from commit sim-times.
- No session ran long enough to cross the mid-session reset, so the "fresh capacity —
  resume" path is untested. Worth a dedicated cell with a closer reset (e.g. 15 sim-min).
- Minor: three cells left SESSION-NOTES.md uncommitted (prompt ambiguity, not a budget
  behavior); tighten the working-rules wording next run.

## Verdict on A2 / gate G1

**Directional pass, both models.** Stamp + fit_check + policy produced exactly the
designed behavior: scope-to-fit under pressure, full throughput when healthy,
reset-aware handoffs. The behavioral thesis holds in simulation; remaining risk is the
data layer (Spike S0) and live context pressure (PreCompact work), not the model's
willingness to act on budgets.
