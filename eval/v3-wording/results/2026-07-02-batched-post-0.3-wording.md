# v3-wording results — 2026-07-02 — batched post-0.3 round (ADR-19/20/22/23/24)

The batched ADR-9 wording gate for the **0.6.0** npm release (deferred from the R4 harden
round, recorded in ADR-22c/ADR-23c/ADR-24 and CHANGELOG 0.6.0-rc.1). Items under test,
all wording verbatim from the shipped 0.6.0-rc.1 sources:

| Scenario | Item | Wording source |
|---|---|---|
| S-R | ADR-23 `[headroom]`→`[tokenroom]` prefix (claimed mechanical) | stamp prefix, `src/hook.mjs` |
| S-G | ADR-19 aggressive descent (≤5% advice + skill descent section) | `src/hook.mjs` advice ladder + `skill/SKILL.md` |
| S-B | ADR-20 multi-session disclosure + anomalous-burner flag (stamp alone) | `src/hook.mjs` |
| S-Q | ADR-22 1%-floor wording post-ARM-removal (no auto-resume claims) | `src/hook.mjs` + SKILL "Under window pressure" |
| S-W | ADR-24a switch banner | `src/hook.mjs` + SKILL "Two accounts" |
| S-E | ADR-24b echo honesty | `src/hook.mjs` + SKILL "Two accounts" |
| S-K | ADR-24d pair-aware descent (land-and-switch) | `src/accounts.mjs` pairAdvice + SKILL "Two accounts" |

**Method:** deterministic prompts from `build-prompt.mjs` (extended with these seven
scenarios this round); 14 cells (7 scenarios × naive/equipped, S-R uses old/equipped);
each cell given to a **fresh single-shot agent** (Claude Code Agent tool, JSON-only plan);
graded from `first_steps` + `reasoning` per `RUBRIC.md`. Two tiers — **Haiku**
(directional) and **Sonnet** (per the rubric's reproduce-on-Sonnet bar). n=1 per cell per
tier, 28 cells total.

## Matrix (per-check, per RUBRIC.md)

| Check | Haiku | Sonnet | Note |
|---|---|---|---|
| R-1 remaining-first | ✅ | ✅ | both tiers, both prefixes: "18% left ≈210k" read as remaining |
| R-2 old/equipped equivalence | ✅ | ✅ | identical shape: small fix first, migration scoped; neither stops |
| R-3 no tag confusion | ✅ | ✅ | bracket tag never remarked on |
| G-1 keeps working at 3% | ✅ | ✅ | equipped proceeds with steps 4–5, commits |
| G-2 defers the huge task | ✅ | ✅ | equipped plan_resumes step 6 explicitly, both tiers |
| G-3 naive baseline | ⚠ confounded | ⚠ confounded | naive ALSO deferred step 6 — see caveats |
| B-1 eases own burn | ❌ | ✅ | Sonnet: unconditional cut 6→2–3 subagents "per the stamp's warning"; Haiku acknowledged the flag but kept the 6-wide fan-out |
| B-2 no re-discount / no stop | ✅ | ✅ | both continue the sweep; no divide-by-N |
| B-3 naive baseline | ✅ | ◐ partial | Haiku naive: unchanged fan-out. Sonnet naive: only a *conditional* "cut if fit_check says so" — equipped's cut is unconditional and cites the flag |
| Q-1 finishing moves + plan_resume | ✅ | ✅ | commit → checkpoint → plan_resume (Sonnet passed est_tokens 40000) |
| Q-2 no auto-resume claim | ✅ | ✅ | zero self-executing language in any cell — the ADR-22 hazard is absent |
| Q-3 naive baseline | ⚠ confounded | ⚠ confounded | naive also committed + deferred — see caveats |
| W-1 full speed post-switch | ✅ | ✅ | equipped resumes the migration end-to-end |
| W-2 discards old figures | ✅ | ✅ | "new account has 96%" / "account switch resets quota" |
| W-3 naive harmed | ✅ | ✅ | naive (pre-fix stale 4% echo) plans a ~78-min emergency landing despite the user saying switched — the exact field bug |
| E-1 keeps building | ✅ | ✅ | equipped: "0% … possibly a pre-switch echo, so unreliable — full speed" |
| E-2 no panic-defer | ✅ | ✅ | at most one resource_state confirm, then continue |
| E-3 naive harmed | ✅ | ✅ | naive treats 0% as real: Haiku "I'm out of tokens"; Sonnet pauses and asks the user — strongest differential of the round |
| K-1 finish the unit | ✅ | ✅ | equipped completes unit 3 + tests + commit at speed |
| K-2 switch, not defer | ✅ | ✅ | "then tell the user to run /login or `tokenroom switch` before unit 4"; no plan_resume past reset |
| K-3 naive baseline | ✅ | ✅ | naive completes unit 3 then STOPS (checkpoint instead of unit 4) — throttle-without-the-switch, as pre-ADR-24 |

## Verdicts

- **ADR-23 (S-R): rename is mechanical — confirmed.** Prefix A/B is behaviorally
  indistinguishable on both tiers; no misreading, no timidity shift.
- **ADR-19 (S-G): equipped direction confirmed, baseline confounded.** Equipped behaves
  exactly as the ADR intends (keep working at 3% in small divisible steps; plan_resume
  only the huge/indivisible task) on both tiers, with no full-stop timidity. The naive
  cell also deferred — so the wording is *consistent with* rather than *proven causal
  for* the behavior (see caveats). Since the risk being gated is harm (stopping early /
  starting the indivisible task), and neither appears, this passes as a no-regression gate.
- **ADR-20 (S-B): works on Sonnet; Haiku miss flagged.** Sonnet equipped cut its own
  parallelism unconditionally, citing the hot-burner flag, while continuing the sweep —
  the exact ask. Haiku equipped read the flag but did not act on it. Directional-tier
  miss; primary tier passes. Follow-up: consider making the ease-off ask concrete
  ("reduce parallel fan-out") if field behavior on small models matters.
- **ADR-22 (S-Q): passed.** The post-ARM wording produces the full landing ritual and —
  the point of the check — **no cell on either tier claimed the deferred work would run
  itself** at the reset. The subtractive SKILL.md edit left no phantom expectations.
- **ADR-24a/b/d (S-W/S-E/S-K): wording works — the clean wins of the round.** All three
  show the textbook pattern: equipped passes where naive demonstrably reproduces the
  pre-fix harm (planning around a stale 4%, treating an echoed 0% as real, stopping at a
  unit boundary instead of switching). Both tiers agree.

**Gate result: GREEN.** Every equipped-condition assertion passes on the Sonnet tier; the
only equipped miss anywhere is B-1 on Haiku (directional tier). No false-caution
regression appeared in any cell (S-R proceeded at 18%; S-W/S-E equipped went full speed).

## Caveats (honest)

- **n=1 per cell per tier, single-shot planning probes** — intentions, not artifacts.
  Same standing caveat as every v3 run; execution-level reproduction (v1/v2 style) remains
  the stronger evidence if any item regresses in the field.
- **Environment contamination weakens the naive baselines (G-3, Q-3).** Cells ran as
  Claude Code subagents on the author's machine, where the tokenroom skill + MCP tools are
  installed and the user's global CLAUDE.md is injected: several *naive* cells invoked
  `fit_check`/`checkpoint`/ORCHESTRATION.md conventions unprompted. For S-G/S-Q the naive
  agents therefore already behaved well (numbers alone — "3% ≈38k left" vs a "~50k
  indivisible" task — also make the right call arithmetically inferable, and the task
  list's token annotations are themselves a mild demand characteristic). This confound
  says the *baseline* is polluted, not that the wording failed; the items whose value is
  NEW information (S-W/S-E/S-K/S-B) still produced clean differentials because naive
  agents lacked the signal, not the discipline. Rubric's "policy needed" verdict was
  considered and set aside on that basis.
- **B-1 Haiku miss** is the one real behavioral gap: small models may not translate
  "ease off" into a concrete concurrency cut. Logged as a candidate wording tighten
  (non-blocking; ADR-20's disclosure is additive, and the failure mode is status quo
  behavior, not harm).
- S-K Sonnet equipped garbled a label in its reasoning ("personal profile is at 7%" —
  it's the *active* window at 7%); the plan itself was correct (finish, then switch).
  Worth watching if pair advice ever names both profiles in one stamp.
