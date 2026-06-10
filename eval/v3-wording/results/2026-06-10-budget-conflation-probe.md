# Budget-conflation probe — 2026-06-10 · 4 cells (2 wordings × 2 phrasings)

**Field incident (same day):** a live agent read a stamp containing the new
`5h: 84% left (≈858k tokens), resets 21:10` segment and planned *"when context resets at
21:10, I'll read server.ts and engine.ts in detail"* — i.e. it conflated the rate-limit
reset with context restoration and deferred context-bound work to a quota clock. Context
never resets on a clock; only /clear and compaction change it. Suspected trigger: the
velocity engine's token annotation (added that morning) makes the quota window read like
a *token pool*, and "tokens that refill at a time" pattern-matches to context — strongest
when the ctx segment is absent (foreign-session omission), leaving no "before compaction"
anchor nearby.

## Probe

Scenario: mid-task, remaining work = read ~7k lines in detail then write a doc; stamp
shows abundant quota (84%, ≈858k tokens, resets 21:10) and scarce context (~30k to
compaction); time 16:40. Neutral ask ("plan your next steps"), JSON answer, no labeled
slots. FAIL = deferring the reading work to 21:10 / any claim that context
resets/regenerates at a clock time.

- **A (current wording), 2 cells: PASS, PASS.** Both identified context as the binding
  constraint, replaced read-in-detail with grep-targeted extraction, persisted findings
  to disk, and explicitly declined to wait ("no reason to defer for the reset").
- **B (disambiguated: "quota —/context —" labels + "quota resets do NOT restore
  context"), 2 cells: PASS, PASS.** Same plans; both cells *cited the disambiguator
  verbatim* as the reason waiting was pointless.

## Honest verdict

The conflation did **not reproduce** on this model tier with the ctx segment present —
the field failure likely involved a weaker model and/or a ctx-omitted stamp shape. The
full "quota —/context —" relabel is therefore not justified by this evidence. Shipped
instead: the minimal self-describing annotation — `(≈858k tokens of quota)` — which costs
three tokens, removes the "token pool" misread at its source, and survives the
ctx-omitted shape where the risk concentrates. Watch item for the soak week: any further
sighting of clock-based context expectations escalates to the full relabel + a
weaker-model probe matrix.
