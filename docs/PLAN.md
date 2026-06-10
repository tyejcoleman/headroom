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

- [ ] **T2.1 Burn modeling.** Parse `~/.claude` session JSONL: percent-per-hour per window, tokens-per-task-class priors; populate `burn.projected_exhaustion` and estimated messages remaining. AC: projection within ±20% across a recorded week of fixtures.
- [ ] **T2.2 Compaction survival.** `PreCompact` hook writes `.headroom/handoff.md` (task state, decisions, next steps) and returns `customInstructions` telling the compactor what to preserve; `SessionStart` hook with `source=compact` re-injects the handoff. AC: post-compaction, the agent resumes the in-flight task without re-reading the repo (continuity eval).
- [ ] **T2.3 Reset scheduler.** On `fit_check → defer`: write a resume plan keyed to `resets_at`; show countdown in the HUD; optional desktop notification. Interactive resume only — no headless quota burn. AC: a blocked task resumes correctly after the window resets.
- [ ] **T2.4 Governor v0 (soft).** `mode: performance | ondemand | powersave` in config shifts skill thresholds (downshift point, checkpoint point, batching aggressiveness). AC: mode change measurably alters agent behavior in the eval without restart.
- [ ] **T2.5 Eval harness + README metrics.** Window utilization %, tasks per window, 429 count, wasted headroom at reset, compaction-continuity score; naive vs. Headroom-equipped comparison chart. AC: reproducible `pnpm eval` run generates the chart.

## Phase 3 — Beyond one harness (month 2)

- [ ] **T3.1 Programmatic-credit meter.** Track the post–June 15 2026 Agent SDK / `claude -p` credit pool: spend at API rates, budget config, dollar-denominated ResourceState mode. AC: matches console billing within rounding on test runs.
- [ ] **T3.2 Codex adapter.** Parse `~/.codex/sessions` and surface 5h/weekly remaining; same schema with `provider: openai`. AC: ResourceState validates; HUD parity with the Anthropic path.
- [ ] **T3.3 RESOURCE-STATE spec v0.1.** Publish schema + adapter contract as `docs/RESOURCE-STATE.md`; semver policy. AC: an external adapter can be written from the doc alone.

## Phase 4 — Governance & on-prem (quarter)

- [ ] **T4.1 Hard gate (opt-in).** `PreToolUse` hook denies or queues expensive operations per policy. AC: deny path tested end-to-end with a clear user-facing reason.
- [ ] **T4.2 Org aggregation.** OTel pipeline → team utilization views. AC: multi-user demo dashboard from two simulated developers.
- [ ] **T4.3 On-prem collector.** DCGM / vLLM / Ollama metrics → `hardware` block (VRAM, queue depth, thermals) + backpressure advisories. AC: vLLM demo where the agent reduces parallelism under load.

## Non-goals

No subscription OAuth reuse outside official clients. No undocumented endpoints. No harness spoofing. No headless soaking of interactive subscription quota.
