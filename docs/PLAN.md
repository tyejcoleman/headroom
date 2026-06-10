# Headroom — Phased Plan

**v0.1 · June 2026 · Companion to ONE-PAGER.md**

Conventions: every task carries acceptance criteria (AC). Hard rule across all phases: nothing calls undocumented endpoints, reuses subscription OAuth tokens outside official clients, spoofs harness identity, or burns interactive subscription quota headlessly.

## Phase 0 — Foundation (days 1–2) — ✅ shipped 2026-06-09

> **Implementation note:** shipped as a single **zero-dependency** npm package
> (`headroom-cc`, plain ESM + `node:test`) instead of the TS/pnpm monorepo — npx-able,
> auditable, no build step. Revisit a split only if the package grows real dependencies.

- [x] **T0.1 Repo scaffold.** ~~TypeScript monorepo~~ → single zero-dep package: `bin/`, `src/`, `skill/`, `schema/`, `test/`. AC met: tests run in CI (GitHub Actions, node 18/20/22 × linux/macOS).
- [x] **T0.2 `headroom-tap` v0.** Statusline command: parse stdin JSON; extract `rate_limits` (absent → degrade, never crash; out-of-range `used_percentage` incl. epoch leaks → null) and `context_window`; atomically write `~/.headroom/state.json` (temp file + rename); render a one-line HUD. AC met: survives malformed/missing/empty stdin (tested); registered by the installer. `--capture` debug flag records raw payloads (subsumes Spike S0).
- [x] **T0.3 ResourceState v0 schema.** JSON Schema in `schema/` + zero-dep validator (`src/schema.mjs`) + fixture corpus (subscription, API-key, epoch-leak with ms-timestamps and negative pct). AC met: tap output validates in tests.

## Phase 1 — Awareness connector (week 1) — ✅ shipped 2026-06-09

- [x] **T1.1 `headroom-mcp`.** stdio MCP server (hand-rolled newline-delimited JSON-RPC, zero-dep), read-only over `state.json`. Tools: `resource_state`, `estimate_remaining`, `fit_check({est_tokens, est_calls})` → `fits | tight | exceeds | defer`. AC met: registered via `claude mcp add` by the installer; no writes, no network; round-trip tested.
- [x] **T1.2 Push injection.** `UserPromptSubmit` hook returns an `additionalContext` stamp — **remaining-first wording** (eval v0 found "X% used" gets misread): `[headroom] 5h: 58% left, resets 14:00 · 7d: 85% left · ctx: ~38k tokens before compaction`. AC met: ≤40 tokens (length-tested); silent when stale/missing/disabled (`HEADROOM_DISABLE=1` or config).
- [x] **T1.3 SKILL.md v1.** Policies: size-to-fit against both budgets (fit_check verdict table); cheap-first under pressure; batch tool calls; defer-past-reset with a named resume time; checkpoint before the ceiling; compress-don't-reread; anti-timidity clause. AC met ahead of build: the scripted eval exists (`eval/v1/`) and this policy passed it on two models (zero 429-exposed work; no timidity) — see `eval/v1/results/`.
- [x] **T1.4 Installer.** `headroom install`: sets the statusline command, registers the MCP server, hook, and skill; idempotent; `uninstall` restores any pre-existing statusline from backup. AC met: sandbox-tested (double-install safe; uninstall leaves no trace). npm publish as `headroom-cc` pending → then `npx headroom-cc install`.

## Phase 2 — Planner & checkpointing (weeks 2–3)

- [x] **T2.1 Velocity engine (token flow) — design finalized + shipped 2026-06-10 (user insight: flow is the unit).** *(±20% projection AC validates over the soak week against recorded history.)* Two flows, cross-calibrated: (a) FAST signal — real token flow (tok/min) from transcript JSONL `usage` records (exact, timestamped, continuous; field-measured: 1.7k–11k out-tok/min across one evening, 2.0M output tokens total, while `used_percentage` is integer-quantized and laggy); (b) ANCHOR — window %-drop from the tap (authoritative for the quota). tokens-per-percent = flow ÷ %-rate, learned empirically per account (the window token denominator is undocumented — this learns it instead of faking it). Unlocks: quota shown as `≈Nk tokens left` in HUD/stamps; exhaustion projection from last-~10-min flow (reacts in seconds instead of the ~20-min median lag); **idle suppression** — near-zero recent flow clears `⚠ empty by` (a projection premised on a burn that stopped is a lie); tokens-per-task-class priors feeding fit_check. AC: projection within ±20% on a recorded week; warning clears ≤2 min after idle; tokens-left labeled ≈ and validated against subsequent actual burn; exhaustion shown as a CONFIDENCE BAND ("00:40–01:30"), not a point — trailing-burn point estimates cause over-reaction to spikes (agent field feedback 2026-06-10).
- [x] **T2.2 Compaction survival.** *(shipped 2026-06-09)* `PreCompact` hook snapshots ground truth a hook can actually capture — branch, uncommitted files, recent commits, budget state — to `~/.headroom/handoffs/<session>.json` (hooks have no model access, so repo facts beat prose; `customInstructions` injection isn't an official surface, dropped). `SessionStart(source=compact)` re-injects it with staleness + wrong-session guards. AC: unit-tested end-to-end; G2-sim continuity eval run (equipped agents resume with ~19% fewer tool calls on the small fixture; differentiation expected to grow with repo size — see `eval/v2-continuity/results/`). Larger-fixture eval run 2026-06-10: honest null on outcome on clean trees, path/speed signal confirmed — see results; v4 needs distractor dirt.
- [x] **T2.3 Reset scheduler.** *(shipped 2026-06-09)* `plan_resume` MCP tool records a deferred-work plan keyed to `resets_at` (the server's one deliberate write surface); HUD shows `⏲ resume HH:MM` countdown, then `✓ deferred ready`; prompt stamps and SessionStart flag readiness after the reset; `headroom resume [--clear]` for humans. Interactive resume only — no headless quota burn. AC: full lifecycle covered in `test/continuity.test.mjs`.
- [x] **T2.4 Governor v0 (soft).** *(shipped 2026-06-10)* `mode: performance | ondemand | powersave` shifts WHEN headroom speaks, never what it says: band thresholds (perf 10/5 · ondemand 25/10/5 · powersave 40/25/10/5), receipt floors, and the re-stamp throttle all come from the mode profile, read per-event (config change applies without restart — tested). The behavioral lever is the same eval-validated band/stamp machinery (ADR-9 evidence carries over); a dedicated mode A/B eval joins the v4 queue.
- [x] **T2.5 Eval harness + README metrics.** *(shipped 2026-06-10 — `npm run eval` regenerates eval/REPORT.md, failing on missing evidence; README links it.)* Window utilization %, tasks per window, 429 count, wasted headroom at reset, compaction-continuity score; naive vs. Headroom-equipped comparison chart. AC: reproducible `pnpm eval` run generates the chart.
- [x] **T2.6 Transcript anchor + verbatim extracts.** *(shipped 2026-06-10)* PreCompact handoff stores `transcript_path` + `custom_instructions` and writes deterministic extracts (every user message, recent failed tool calls) to `handoffs/<session>.extracts.json`; post-compaction injection points at both — pointer, never payload (ADR-11). AC: synthetic-transcript unit test; injection asserted to contain paths but no extract content; survives missing/garbage transcripts.
- [x] **T2.7 Pins.** *(shipped 2026-06-10)* `pin_fact` MCP tool (second write surface, ADR-12) + `headroom pin|pins|unpin`; pins re-injected verbatim at SessionStart(source=compact); capped (500 chars, 50 pins, 7d TTL). AC: full lifecycle unit-tested incl. TTL expiry and MCP path without state; skill teaches when to pin. *(ADR-9 eval PASSED 2026-06-10 — `eval/v3-wording/results/`.)*
- [x] **T2.8 Compact Instructions block.** *(shipped 2026-06-10)* Installer appends a marked, removable `## Compact Instructions` block to `~/.claude/CLAUDE.md` (the official summary-shaping surface): preserve exact paths, failing commands, user wording verbatim; remaining-first budgets. AC: idempotent install, clean uninstall preserving user content, dry-run aware.
- [x] **T2.9 Compaction observability.** *(shipped 2026-06-10)* PostCompact hook + event log (`~/.headroom/events.jsonl`, capped); tap detects silent context cliffs (microcompaction fires no hooks) for the same session; next stamp discloses once with the transcript path as recovery route; suppressed when a real compact/clear/session event explains the drop. AC: detect, announce-once, and suppression all unit-tested.
- [x] **T2.11 Mid-turn threshold re-stamps.** *(shipped 2026-06-10, ADR-14)* Stamps arrive only at UserPromptSubmit, so during a long autonomous turn the agent never sees budget updates (field-observed 2026-06-10: agent built for an hour while 5h went 39%→13% and never re-checked). PostToolUse hook injects a re-stamp ONLY when a budget crosses a band (25/10/5% left, or exhaustion projected before reset) — throttled, never chatty. AC: band-crossing logic unit-tested; eval shows mid-turn downshift/defer without timidity (ADR-9).
- [x] **T2.13 Cost receipts (agent field feedback 2026-06-10: "balance without receipts = pricing by vibes").** *(shipped 2026-06-10)* After expensive operations (subagent/workflow completions, large tool bursts), inject a one-line receipt: `last operation: ≈487k tokens ≈ 13% of 5h` — per-action unit economics so agents learn to price the NEXT action. Mechanism: PostToolUse measures Δ across the call (transcript-flow-accurate once T2.1 lands; %-delta fallback before). AC: receipt within ±25% of transcript truth; emitted only above a cost floor — receipts must never become spam.
- [x] **T2.14 Launch gate (structural fit_check).** *(shipped 2026-06-10, opt-in `launch_gate`)* An agent about to overspend is by definition not auditing itself — make the check structural, not voluntary. PreToolUse hook on expensive launches (Task/Agent/Workflow tools): auto-run fit_check with a size estimate; `defer` → block with reason + point at plan_resume; `tight` → warn-through. Opt-in, fail-open on missing data (ADR-13 pattern), never blocks cheap calls. AC: blocked launch shows actionable reason; zero false blocks across a normal session.
- [x] **T2.15 Armed resume (auto wake at reset).** *(shipped + ARMED LIVE 2026-06-10, ADR-16 written, CLAUDE.md headless rule amended)* `headroom resume --arm`: per-plan, user-approved scheduling of the deferred work at `resume_at` via OFFICIAL surfaces only (OS launchd/cron or the harness's own scheduled tasks running documented headless `claude -p`, with guardrails: --max-turns, tool allowlist, pinned cwd). Headroom NEVER arms itself — the user schedules the spend, sees exactly what/when, `--disarm` removes. AC: armed plan runs at reset and writes its output to a reviewable location; disarm verified; consent contract documented in ADR-16.
- [x] **T2.12 Model-authored checkpoint (the "meta" layer).** *(shipped 2026-06-10, ADR-15; wording in eval queue)* Hooks have no model, so today's handoff is facts-only (ADR-8); the missing half is judgment: when context runs LOW, the AGENT decides what must survive. `checkpoint` MCP tool (third write surface — needs ADR-15 amending ADR-8: facts from hooks, judgment from models): agent saves a structured survival note — task state, decisions + why, rejected approaches (prevents re-trying dead ends), exact next steps, key values — capped ~2k tokens, session-scoped, 6h staleness, latest-wins. Trigger loop: ctx band crossings (T2.11) change advice to "write a checkpoint NOW via the checkpoint tool"; skill gets a "when ~25 points to ceiling, checkpoint" rule. SessionStart(source=compact) re-injects facts first, then the model's note. AC: lifecycle unit-tested; continuity eval v3 measures resume quality checkpoint+handoff vs handoff-only (ADR-9 before publish).
- [x] **T2.10 Compact guard.** *(shipped 2026-06-10)* Opt-in `compact_guard_min`: blocks AUTO compaction only when the 5h reset is ≤N minutes away (post-reset `/clear` beats compacting into a dying window); never blocks manual `/compact`; fail-open (ADR-13). AC: auto-only, near-reset-only, and allow-path all unit-tested.

## Phase 2.5 — Free-tier wow wave (post-launch; single-dev features stay free forever)

Rule: free = everything one dev on one machine feels; paid = the organizational plane
only. Every feature here doubles as a Pro demo — never gate it.

- [ ] **T2.16 `headroom recap`.** End-of-session / `--week` story from existing data
  (events, flow, receipts, history): duration, cost, tokens out, windows consumed,
  compactions survived, top-N expensive operations — and the headline nobody has seen:
  **tokens expired unused at resets**. Shareable text block (screenshot-friendly). AC:
  zero new collectors; numbers tie to evidence files; renders in <100ms.
- [ ] **T2.17 `headroom drill`.** Compaction preview: render exactly what would survive
  if compaction hit NOW (fact snapshot, checkpoint or its absence flagged, pins,
  transcript anchor). AC: pure read; uses the shipped renderers; warns when the
  checkpoint is missing or stale.
- [ ] **T2.18 Multi-session watch.** Per-session state retention (state-<session>.json
  alongside last-writer state.json) so `headroom watch` shows every live session's
  context/cost side by side — "who's eating my window". AC: ADR for the state layout
  change; concurrent-session fixture test; ADR-7 scoping preserved.
- [ ] **T2.19 `headroom brief`.** Morning block: deferred-ready, pins, last recap line,
  calibration state, weekly shape. AC: composes T2.16 internals; no new state.
- [ ] **T2.20 Context-hygiene signals (design first).** Re-read churn / edit-thrash
  detection from flow samples — the "tired agent" beyond budgets. Eval-gated (ADR-9)
  before any injection wording ships.

## Phase 3 — Beyond one harness (month 2)

- [ ] **T3.1 Programmatic-credit meter.** Track the post–June 15 2026 Agent SDK / `claude -p` credit pool: spend at API rates, budget config, dollar-denominated ResourceState mode. AC: matches console billing within rounding on test runs.
- [ ] **T3.2 Codex adapter.** Parse `~/.codex/sessions` and surface 5h/weekly remaining; same schema with `provider: openai`. AC: ResourceState validates; HUD parity with the Anthropic path.
- [x] **T3.3 RESOURCE-STATE spec v0.1.** *(shipped 2026-06-10 as docs/RESOURCE-STATE.md — write contract, scoping rules, additive-only versioning, adapter checklist.)* Publish schema + adapter contract as `docs/RESOURCE-STATE.md`; semver policy. AC: an external adapter can be written from the doc alone.

## Phase 4 — Governance & on-prem (quarter)

- [x] **T4.1 Hard gate (opt-in).** *(satisfied early by T2.14 launch_gate, 2026-06-10 — PreToolUse deny with actionable reason, tested.)* `PreToolUse` hook denies or queues expensive operations per policy. AC: deny path tested end-to-end with a clear user-facing reason.
- [ ] **T4.2 Org aggregation.** OTel pipeline → team utilization views. AC: multi-user demo dashboard from two simulated developers.
- [ ] **T4.3 On-prem collector.** DCGM / vLLM / Ollama metrics → `hardware` block (VRAM, queue depth, thermals) + backpressure advisories. AC: vLLM demo where the agent reduces parallelism under load.

## Non-goals

No subscription OAuth reuse outside official clients. No undocumented endpoints. No harness spoofing. No headless soaking of interactive subscription quota.
