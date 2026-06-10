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
Plain ESM, `node:` builtins only, no build step, one npm package (`headroom-cc`). *Why:*
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
