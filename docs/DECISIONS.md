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
Rate-limit windows are true for every session OF THE SAME ACCOUNT; context and cost belong to
ONE session. `state.json` is last-writer-wins across concurrent sessions, so consumers must
check `session_id` before presenting session-scoped fields (the stamp omits foreign context).
*Why:* field bug 2026-06-09 — a fresh session's $0.00 displayed in another session.
**Enforced by:** tests. **Amended by ADR-21:** "account-level" only holds within one account;
when concurrent sessions span DIFFERENT accounts the windows are isolated per account, because
the payload carries no account id to disambiguate them.

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

## ADR-16 — Armed resume: the user schedules the spend (amends the headless rule) — SUPERSEDED by ADR-22
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
audit-log `armed`/`resume_run` events, this ADR. **Superseded by ADR-22 (2026-07-01):**
the execution half (the ARM executor) is removed; the consent principle carries over to
the Conductor package. The headless-rule amendment is withdrawn — the plain rule stands.

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

## ADR-17 — `suggest` is propose-only; evolution is versioned and reversible
The self-evolving harness (docs/EVOLVING-HARNESS.md) is built in exactly one safe
direction. `headroom suggest` and its synthesis step are **read-only**: they find and rank
friction and draft proposals, but never mutate the harness. Every proposal must cite the
events that motivated it (no vibes). Applying an evolution (v3+) is a separate, explicit,
versioned, one-command-reversible step under `~/.headroom/evolution/`, and any
behavior-changing evolution is eval-gated (ADR-9). Autonomy (auto-apply) is gated on a
proven auto-evaluation capability that does not yet exist; until then the system is
propose-only, forever if necessary. *Why:* a harness that silently rewrites itself is the
highest-risk pattern in the field (drift, injection-persistence, bloat); propose-only
captures the value with none of the danger. **Enforced by:** suggest does no writes;
this log; ADR-9 for adoption.

## ADR-18 — Continuity handoff doc: the model's living markdown working-doc (amends ADR-6, extends ADR-15)
ADR-15 added `checkpoint` for the model's TERSE last-second survival note. The continuity
handoff doc is its richer sibling: a model-authored, EVOLVING **markdown** working-document
— mission, current state, progress, exact next steps, key references, decisions + why, the
**user's own directives**, system/process improvements discovered, open questions — written
throughout a long-running task, not just at the ceiling. It is the **fourth MCP write
surface** (after plan_resume, pin_fact, checkpoint; ADR-6 enumerated the write surfaces and
is amended again here). Stored as markdown under `~/.headroom/continuity/<session>.md`
(+ `.meta.json` for the digest), session-scoped with the same tag-and-guard rule as
checkpoint (MCP carries no session id → tag with the latest tap session; injection guard
accepts a match or an untagged doc), capped per section, latest-wins, 24h staleness, pruned
after 7 days. Re-injected at SessionStart(source=compact) as a **pointer + digest**
(ADR-11: the doc lives on disk; compaction just freed the context, so point — don't dump).
*Why:* native compaction summarizes generically, and a terse checkpoint captures the resume
pointer but not the accumulated working knowledge (references, the user's exact directives,
improvements found) that lets a long-running process survive REPEATED auto-compactions at
full velocity. It reframes context-pressure from a stop-signal into a write-the-handoff
ritual — the field report that motivated it was an agent getting "tired"/cautious near
compaction instead of handing off and continuing. **Enforced by:** caps + session guards in
`src/continuity.mjs`, lifecycle tests; skill + ctx-band wording joins the eval queue (ADR-9).

## ADR-19 — Aggressive descent: full speed to 5%, mindful to a 1% floor
The 5h/7d rate-limit windows are spent down AGGRESSIVELY. The agent works at FULL SPEED
until 5% remains; from 5% down to a 1% floor it is told to be velocity-mindful (but keeps
working); at ≤1% it does finishing-moves only (commit in-flight work, checkpoint,
plan_resume, start nothing new). Quota left unspent before a reset is wasted, so the goal is
to use the window right down to the floor — never to stop early "to be safe". The 1–5% band
keeps ONE guard so aggression doesn't cause loss: prefer small divisible steps, checkpoint
often, and defer a genuinely huge/indivisible new task (plan_resume). The velocity-aware
optimism overrides still win — if the window resets before the burn would exhaust it, stay
full speed even under 5%. *Why:* the prior ladder cautioned at 10% and stopped new work at
5%, leaving usable capacity unspent every reset; the field directive was to burn to the
floor while keeping a stranding guard for indivisible work. **Enforced by:** the advice
ladder in `src/hook.mjs`, a `1`-band in every `modeProfile` (`src/util.mjs`) so the floor
message fires, the launch gate's ≤5% indivisible-launch block, and the descent-ladder test
in `test/compaction2.test.mjs`; stamp wording joins the eval queue (ADR-9).

## ADR-20 — Multi-session disclosure: combined burn rate + anomalous-burner flag
The 5h/7d windows are ACCOUNT-level, so concurrent sessions share them. Beyond the existing
"N sessions sharing" count, the stamp now discloses the COMBINED burn rate (the flow log
already aggregates every session's transcript, so `out_per_min` over it IS the combined
rate) and flags an ANOMALOUS burner — a session burning ≥3× the median of the others, above
a floor — naming whether it's THIS session (ease off) or another (the shared window can drop
fast; re-check often). To attribute per-session, flow samples are tagged with their
`session_id` at sample time (the only new data; pre-tag samples fold into "unknown" and
degrade gracefully). *Why:* on shared-quota nights a single runaway session can drain the
window for everyone; the agent should see the combined velocity and know if it — or a
sibling — is the one burning hot. Stays within official extension points (transcript
`usage` + hook stdin); no per-session identity beyond the harness's own session id. **Enforced
by:** `sessionFlowStats` in `src/flow.mjs`, the disclosure line in `src/hook.mjs`, and the
anomaly test in `test/flow.test.mjs`; wording joins the eval queue (ADR-9).

## ADR-21 — Per-account isolation of all account-scoped state (amends ADR-7)
The statusline payload carries NO account identifier (only `session_id`, `workspace` dirs,
`rate_limits`, `context_window`, `cost`). ADR-7 assumed the rate-limit windows are
account-level and "safe to show anywhere" — but that breaks when concurrent sessions are
logged into DIFFERENT accounts: they all write one global `~/.headroom/state.json`
(last-writer-wins), so the agent-facing stamp shows whichever account rendered the statusline
last. Field evidence 2026-06-25 (live `--capture`): two accounts writing the same `state.json`,
the 7d figure flip-flopping 2%↔93% between renders — a session on the 98%-weekly-left account
was being told it had 7% left.

Fix: every account-SCOPED store gets its own subtree `~/.headroom/accounts/<key>/` —
`state.json`, `history.jsonl`, `calib.json`, `flow.jsonl`, `flow-cursors.json`, `bands.json`.
The account key is derived from the windows' reset PHASE (`resets_at mod window_length`),
which is invariant across resets within an account but differs between accounts. The tap
(which sees `rate_limits`) routes all reads/writes to `accountDir(key)`, records a
`session_id → key` map in `sessions.json`, and mirrors the latest account's `state.json` to
the top-level path as a POINTER for the human CLIs (`watch`/`line`/`doctor`/`mcp`) that have
no session context. Hooks never receive `rate_limits`, so they resolve their account via
`quotaScope(session_id)`: the mapped account, or — to avoid regressing single-account users —
the sole account when only one exists, or the legacy global layout when none exist. Only when
≥2 accounts exist AND the session is unmapped is quota WITHHELD (we can't attribute it; showing
the wrong account is the bug). Multi-session disclosure (ADR-20) now reads per-account
bands/flow, so "N sessions sharing this quota" and the combined-burn figure count SAME-account
sessions only — a sibling on another account no longer inflates them.

Key stability assumes a roughly fixed reset cadence (the same assumption ADR-7's reset
handling already makes). If the phase ever drifts, the worst case is a same account splitting
into a new bucket (history/calib rebuild in ~10 min) — never cross-account contamination, the
only failure mode that matters. api-key users (no windows → null key) keep the legacy global
layout unchanged. *Why:* a resource-awareness tool that reports another account's quota is
worse than silent. **Enforced by:** `accountKey`/`accountDir`/`recordSessionAccount`/
`accountForSession`/`quotaScope`/`gcAccounts` in `src/util.mjs`; per-account `dir` routing in
`src/state.mjs`, `src/flow.mjs`, `src/tap.mjs`, `src/hook.mjs`; unit + end-to-end isolation
tests in `test/state.test.mjs` and `test/cli.test.mjs`. Stays within official extension points
(statusline stdin only); introduces no new identity source. Stamp WORDING is unchanged (the
quota line text is identical; isolation only changes WHICH account's numbers fill it, and
withholding is an omission per "never inject a lie") — so ADR-9's eval gate is not triggered.

## ADR-22 — ARM mode removed (supersedes ADR-16)
The autonomous headless resume executor — `src/arm.mjs`, the launchd plist machinery,
headless `claude -p` invocation, `headroom resume --arm/--disarm`, `resume-run`, and the
`auto_arm` standing-consent flag — is removed entirely. Three reasons, in order:
(a) The 2026-06-15 platform change split programmatic use (`claude -p`, the Agent SDK)
into a separate monthly API-priced credit pool, distinct from the interactive
subscription windows. ARM's entire economic premise was "use quota that would otherwise
expire at the reset"; a headless run no longer draws from that expiring pool, so an armed
resume now spends NEW metered money instead of salvaging sunk quota. The feature's why is
gone. (b) Autonomous continuation moves to a separate **Conductor** package built on
official in-session surfaces — Stop-hook continuation, scheduled wakeups past resets, and
official cron routines — where the work runs inside the interactive session whose quota
it was deferred from. (c) ADR-16 is superseded for execution, but its consent principle
(the USER schedules/authorizes autonomous spend; the tool never arms itself; transparent,
guard-railed, disarmable) carries over to Conductor as a design requirement. The
awareness half of deferral is untouched and stays: `plan_resume` (the MCP write surface,
ADR-6), `resume.json`, the HUD reset countdown / `✓ deferred work ready`, the
"deferred work is now ready" stamps, and `headroom resume [--clear]`. The headless-rule
amendment ADR-16 made to CLAUDE.md is withdrawn: the plain rule "never burn interactive
subscription quota headlessly" stands without a carve-out. Note: the small subtractive
wording edits this removal forced in `skill/SKILL.md` (dropping the "armed resume
continues after the reset" clause) have NOT yet re-run the ADR-9 wording eval — that pass
is deferred to the harden round of the current build. *Why:* a scheduler whose economics
inverted from "salvage expiring capacity" to "spend new metered credits unattended" is
the exact pattern this project exists to refuse. **Enforced by:** the code no longer
exists; grep gate in the removal commit; this ADR.
