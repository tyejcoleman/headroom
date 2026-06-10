# Headroom — Phased Plan

**v0.1 · June 2026 · Companion to ONE-PAGER.md**

Conventions: every task carries acceptance criteria (AC). Hard rule across all phases: nothing calls undocumented endpoints, reuses subscription OAuth tokens outside official clients, spoofs harness identity, or burns interactive subscription quota headlessly.

## Phase 0 — Foundation (days 1–2)

- [ ] **T0.1 Repo scaffold.** TypeScript monorepo (pnpm workspaces): `packages/tap`, `packages/mcp`, `packages/hooks`, `packages/skill`, `packages/schema`. AC: clean build; lint + unit tests run in CI.
- [ ] **T0.2 `headroom-tap` v0.** Statusline command: parse stdin JSON; extract `rate_limits` (field may be absent — degrade, never crash; clamp `used_percentage` to 0–100, else treat as null) and `context_window`; atomically write `~/.headroom/state.json` (temp file + rename); render a one-line HUD to stdout. AC: registers via `/statusline`; survives malformed/missing fields; <10 ms typical execution.
- [ ] **T0.3 ResourceState v0 schema.** JSON Schema in `packages/schema` + validation tests + fixture corpus (subscription, API-key, absent-field, and epoch-leak cases). AC: tap output always validates against the schema.

## Phase 1 — Awareness connector (week 1)

- [ ] **T1.1 `headroom-mcp`.** stdio MCP server, read-only over `state.json`. Tools: `resource_state` (full state), `estimate_remaining` (burn → estimated messages/time left per window), `fit_check({est_tokens, est_calls})` → `fits | tight | split | defer(resets_at)`. AC: registered with `claude mcp add`; responds <50 ms; no writes, no network.
- [ ] **T1.2 Push injection.** `UserPromptSubmit` hook returns an `additionalContext` stamp, e.g. `[headroom] 5h 42%→14:00 · 7d 15% · ctx 61%/80% ceiling · mode:ondemand`. AC: stamp ≤40 tokens; hook completes <200 ms; config flag to disable.
- [ ] **T1.3 SKILL.md v1.** Policies: size-to-fit against both budgets; cheap-first past 70% window; batch tool calls; cache-friendly ordering; model downshift for subtasks; compress-don't-reread; checkpoint rules. AC: scripted eval — given a 3-task queue under a constrained window, the agent reorders and right-sizes tasks unprompted.
- [ ] **T1.4 Installer.** `npx @headroom-ai/install`: sets the statusline command, registers the MCP server and hooks; idempotent; `--uninstall` supported. AC: fresh-machine install under 1 minute; uninstall leaves no trace.

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
