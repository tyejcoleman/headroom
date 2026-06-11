# Decision log (ADRs)

Numbered, append-only. Each records a decision, its *why*, and what enforces it.
Agents and humans: **do not silently violate these** — if one blocks you, open an issue
or add a new ADR superseding it. The invariant gates (`scripts/check-invariants.mjs`)
cite these numbers in their failure messages.

## ADR-1 — Official surfaces only; never the network
Headroom reads statusline stdin JSON, hook payloads, and the user's own local files; it
writes only under `~/.headroom/` and the user's Claude Code settings (via the installer).
It NEVER: reuses subscription OAuth tokens outside official clients, calls undocumented
endpoints, spoofs harness identity, makes any network request, or burns interactive quota
headlessly. *Why:* the project's credibility — and its users' accounts — depend on it.
**Enforced by:** gates G3/G4; review.

## ADR-2 — Zero-dependency single package
Plain ESM, `node:` builtins only, no build step, one npm package (`headroom-harness`). *Why:*
a tool that wires into people's harness must be auditable in one sitting and npx-able;
supply-chain surface stays zero. The original TS/pnpm monorepo plan was deliberately
dropped (2026-06-09). **Enforced by:** gates G1/G2.

## ADR-3 — Remaining-first wording, everywhere
Stamps, HUD, tools always say what's LEFT ("58% left", "≈6k tokens"), never what's used.
*Why:* eval v0 caught a model reading "18% used" as 18% remaining; humans make the same
mistake. **Enforced by:** tests asserting stamp/HUD text; review.

## ADR-4 — Display only actionable signals
No raw burn rates or vanity metrics in human/model surfaces. Burn appears only as an
exhaustion warning when projected to hit BEFORE the reset; cost hidden when ~$0; data age
disclosed past 2 minutes, silence past 30. *Why:* field-tested 2026-06-09 — a technically
true "183%/h" (from a poisoned sample) destroyed trust instantly. **Enforced by:** tests.

## ADR-5 — Degrade, never crash; atomic writes
Statusline/hook entry points must always exit 0 and print something sensible; every
external field may be absent, malformed, or buggy (clamp 0–100, epoch-leak → null,
ms-timestamps tolerated); state writes are temp-file + rename. *Why:* a broken statusline
is worse than no statusline. **Enforced by:** gate G5, fixture-corpus tests.

## ADR-6 — MCP server: read-only plus exactly one write surface
The MCP server reads `state.json` and writes nothing — except `plan_resume`, which writes
the resume plan to `~/.headroom/resume.json`. Any new write surface needs its own ADR.
*Why:* a budget reporter that mutates state is a trust problem. **Enforced by:** review +
this log.

## ADR-7 — Account-scoped vs session-scoped data are different things
Rate-limit windows are true for every session; context and cost belong to ONE session.
`state.json` is last-writer-wins across concurrent sessions, so consumers must check
`session_id` before presenting session-scoped fields (the stamp omits foreign context).
*Why:* field bug 2026-06-09 — a fresh session's $0.00 displayed in another session.
**Enforced by:** tests.

## ADR-8 — Handoffs carry ground truth, not prose
Hooks have no model, so the PreCompact handoff records facts (branch, dirty files, recent
commits, budgets) rather than summaries, and SessionStart re-injects them verbatim with
wrong-session and staleness guards. `customInstructions` injection into the compactor is
NOT an official surface — dropped from the original plan. *Why:* facts survive; prose
written without a model is noise. **Enforced by:** tests; ADR-1.

## ADR-9 — Validate behavior before building machinery
Features that claim to change model behavior get an eval first (see `eval/`,
`docs/VALIDATION.md`). Eval prompts must not offer the desired behavior as a labeled slot
(demand characteristics), graders use artifacts over self-reports, and results are
published honestly — including weak ones (see the G2-sim writeup). *Why:* the v0→v1 eval
cycle caught timidity, stamp misreading, and overclaiming before they shipped.

## ADR-10 — package.json is the single version source
`src/mcp.mjs` reads its version from package.json at runtime; nothing else hardcodes it.
*Why:* the 0.1.1→0.2.0 bump required synchronized edits in two files; that class of bug
is eliminated structurally. **Enforced by:** code structure.

## ADR-11 — Transcript anchor: pointer, not payload
The PreCompact handoff records the transcript path and writes deterministic verbatim
extracts (every user message, recent failed tool calls) to a sidecar file
(`handoffs/<session>.extracts.json`); the post-compaction injection includes the *paths*,
never the contents. *Why:* compaction just freed the context — refilling it with bulk
history defeats the purpose, and the #1 field complaint about compaction is "the data is
still on disk but the model guesses instead of reading it". A pointer lets the model
fetch exactly what it needs. **Enforced by:** test asserting injected context contains
paths but not extract contents.

## ADR-12 — Pins are the MCP server's second write surface (amends ADR-6)
`pin_fact` (and `headroom pin`) writes `~/.headroom/pins.json`: facts re-injected
VERBATIM at SessionStart(source=compact). Constrained hard: text ≤500 chars, ≤50 pins,
default TTL 7 days, ≤20 re-injected. *Why:* paraphrase drift of user constraints is a
top compaction failure mode (2026 field survey), and only the model can identify which
sentences must not be reworded — that requires a tool, which requires a write. Pins are
not general memory; the caps enforce that. **Enforced by:** caps in `src/pins.mjs`, tests.

## ADR-13 — Compact guard is opt-in, auto-only, fail-open
Blocking compaction (official PreCompact capability since Claude Code v2.1.105) is OFF
by default. When enabled (`compact_guard_min` in `~/.headroom/config.json`) it blocks
only `trigger: "auto"` — never a user's manual `/compact` — and only when the 5h reset
is ≤N minutes away (a post-reset `/clear` beats compacting); any error in the guard path
falls through to allowing compaction. *Why:* a wrongly-blocked compaction can wedge a
full-context session; the guard must be impossible to blame for one. **Enforced by:**
tests covering all three guards (auto-only, near-reset-only, fail-open default-off).

## ADR-14 — Mid-turn awareness is push-on-worsening, throttled
Stamps fire only at UserPromptSubmit, so a long autonomous turn burns blind while
state.json stays fresh (field-observed 2026-06-10: 5h went 39%→13% across one turn and
the agent never re-saw a number). The PostToolUse hook re-stamps ONLY when a budget
crosses a WORSENING band (5h: 25/10/5% left; context: 25/10 points to ceiling;
exhaustion-before-reset flipping true), at most every 120s; first sight and improvements
are silent. *Why:* per-tool-call stamps would drown the context and train the model to
ignore them — band crossings are the only mid-turn news that changes decisions.
**Enforced by:** tests; new wording joins the ADR-9 eval queue before publish.

## ADR-16 — Armed resume: the user schedules the spend (amends the headless rule)
The hard rule "never burn interactive subscription quota headlessly" exists to stop
TOOLS from spending quota the user didn't choose to spend. Armed resume does not cross
it — it inverts it: the USER schedules the spend, either per-plan (`headroom resume
--arm`, which prints exactly what command runs, when, and where the output goes) or via
the standing-consent config flag `auto_arm` (every plan_resume also arms). Constraints
that keep this honest: official `claude -p` headless mode only; guardrails embedded in
the armed command (`--max-turns`, constrained tools, pinned cwd); output to a reviewable
log; `--disarm` removes everything; the firing entry point self-disarms after one run;
headroom NEVER arms without one of the two consents. *Why:* deferred work that resumes
itself at the reset is the product's whole point — done with consent it's a feature,
done without it's malware. **Enforced by:** consent checks in code, dry-run output,
audit-log `armed`/`resume_run` events, this ADR.

## ADR-15 — Facts from hooks, judgment from models (amends ADR-8)
ADR-8 holds: hooks have no model, so hook-captured handoffs carry only facts. The
`checkpoint` MCP tool (third write surface) adds the other half: the AGENT saves its own
survival note — task, state, decisions with why, ruled-out approaches, exact next steps,
key values — triggered by the ctx band-crossing mid-task update, re-injected at
SessionStart(source=compact) AFTER the fact snapshot (facts anchor, judgment annotates).
Caps (300-600 chars/field, 8 items/list, latest-wins, 6h staleness) keep it a
distillation, not a context dump. Known limitation: MCP calls carry no session id, so
the note is tagged with the latest tap session and the injection guard accepts a match
or an untagged note — exact for single-session use, documented race for concurrent
sessions. *Why:* native compaction summarizes generically at the last second; the agent
knows what THIS task needs, and "already ruled out" is the single most expensive thing
compaction loses. **Enforced by:** caps in `src/checkpoint.mjs`, lifecycle tests; new
wording joins the eval queue (ADR-9).
