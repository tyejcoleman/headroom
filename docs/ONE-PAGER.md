# Tokenroom — Resource-Aware Agent Layer

**One-pager · v0.2 · June 2026 · Core license: Apache-2.0**

**Goal.** Make the agent *aware* of its two scarcest resources — account-level **rate-limit headroom** (5h / 7d windows) and session-level **context headroom** (tokens left before compaction) — so it can **plan** work scoped to what is actually available, **optimize** how it spends (batching, caching, model tier), and **maximize** utilization of capacity that would otherwise expire.

**Problem.** Claude Code retries 429s silently and compacts context mid-task; the model plans as if both budgets were infinite. Subscription windows are use-it-or-lose-it, and compaction breaks task continuity. Existing tools (ccusage, dashboards, menu-bar apps) are human-facing and retrospective. Nothing feeds either budget *to the agent*.

**Thesis.** Model-facing, real-time, planning-oriented. Two budgets, one state, injected into the harness itself.

## Architecture (official extension points only)

```
collectors                 state                     awareness connector → Claude Code
----------                 -----                     ---------------------------------
statusline tap   ─┐                                  push  UserPromptSubmit hook:
  rate_limits +   ├─▶ ~/.tokenroom/state.json ─▶            ~40-token tokenroom stamp/prompt
  context_window  │   + burn rates,                        SessionStart(source=compact):
OTel receiver    ─┤     projections                        re-inject handoff after compaction
JSONL scanner    ─┘                                  pull  MCP: resource_state, fit_check
                                                     policy SKILL.md: scope-to-fit planning
                                                     human statusline HUD
```

`tokenroom-tap` is the registered statusline command: one stdin JSON carries **both budgets** (`rate_limits` and `context_window`) — it renders the HUD and atomically writes the state file. The **awareness connector** closes the loop into the harness itself: every prompt arrives pre-stamped with current tokenroom via hook-injected context, the model pulls detail or runs `fit_check` through MCP, and the skill defines how to act on it. Zero extra API calls, no polling cost.

## Data sources and compliance

| Source | Yields | Status |
|---|---|---|
| Statusline `rate_limits` (Claude Code ≥ v2.1.80, Mar 19 2026) | `five_hour` / `seven_day`, each with `used_percentage` (0–100) and `resets_at` (Unix epoch seconds). Pro/Max only; present after first API response | ✅ official |
| Statusline `context_window` (same JSON) | `context_window_size`, `used_percentage`, current token usage breakdown | ✅ official |
| Hooks: `UserPromptSubmit`, `SessionStart`, `PreCompact` | context injection (`additionalContext`), compaction checkpointing (`customInstructions`) | ✅ official |
| OTel (`CLAUDE_CODE_ENABLE_TELEMETRY=1`) | `claude_code.token.usage` (by type/model), `claude_code.cost.usage`, tool/session events | ✅ official |
| `~/.claude` session JSONL + stats-cache | history, per-project burn modeling | ✅ your own files |
| API-key mode: `anthropic-ratelimit-*` response headers | RPM / ITPM / OTPM + reset | ✅ documented |
| Codex: `/status`, open-source CLI + app-server protocol, `~/.codex/sessions` | 5h / weekly remaining %, tokens | ✅ permissive vendor posture |
| Subscription OAuth token outside official clients · undocumented `api/oauth/usage` · spoofed harness headers · reading `.credentials.json` to call APIs | — | ❌ **never** (Consumer ToS, Feb 19 2026) |

**Defensive parsing (known quirks).** `rate_limits` may be absent (API-key auth, older versions, intermittent regressions) → degrade gracefully to JSONL-based estimation, never crash the statusline. An early-window bug can leak epoch values into `used_percentage` → clamp to 0–100, otherwise treat as null.

## ResourceState v0

```json
{
  "updated_at": 1765900000,
  "provider": "anthropic",
  "auth": "subscription",
  "windows": {
    "five_hour": { "used_pct": 42.5, "resets_at": 1765912800 },
    "seven_day": { "used_pct": 15.3, "resets_at": 1766400000 }
  },
  "context": {
    "window_size": 200000,
    "used_pct": 61.2,
    "compact_ceiling_pct": 80,
    "tokens_to_ceiling": 37600
  },
  "burn": { "pct_per_hour": 9.8, "projected_exhaustion": null },
  "session": { "cost_usd": 0.47, "tokens": { "in": 0, "out": 0, "cache_read": 0 } },
  "mode": "ondemand"
}
```

## Behavioral layer (the skill)

Every task is sized against **both budgets** before it starts: estimated tokens vs. context-to-ceiling, estimated calls vs. window remaining — scope to fit the smaller budget, split the task if it doesn't fit. Under pressure: triage cheap-first past 70% window, batch tool calls, prefer cache-friendly ordering, downshift subtasks to a smaller model, compress context instead of re-reading files. Approaching the **context ceiling**: checkpoint via PreCompact (write a handoff note; pass preserve-rules to the compactor) and resume from the handoff when SessionStart fires with `source=compact`. Approaching **window exhaustion** (90%, or `projected_exhaustion < task_estimate`): commit at a clean boundary and queue resumption for `resets_at`.

## Phases

Built in five phases — scoped tasks and acceptance criteria live in `docs/PLAN.md`. **P0** foundation (tap + state) · **P1** awareness connector (hooks + MCP + skill) · **P2** planner & checkpointing (burn models, fit_check, compaction survival) · **P3** beyond one harness (programmatic-credit meter, Codex adapter, RESOURCE-STATE spec) · **P4** governance & on-prem (hard gates, org OTel, hardware backpressure).

## Positioning

Open-source the core (spec, collectors, MCP server, hooks, skill) under Apache-2.0 — the metering layer is already commoditized; the durable value is the behavioral and governance layer. Commercial tier, if ever, is team/enterprise only: org-wide OTel aggregation, budget policy, credit-pool governance.

## Bootstrap (for Claude Code)

```bash
mkdir tokenroom && cd tokenroom && git init && mkdir docs
cp ~/Downloads/tokenroom-one-pager.md docs/ONE-PAGER.md
cp ~/Downloads/tokenroom-plan.md docs/PLAN.md
printf 'Read docs/ONE-PAGER.md then docs/PLAN.md fully before any work.\n' > CLAUDE.md
claude
# first prompt: "Execute Phase 0 of docs/PLAN.md. TypeScript monorepo.
#                Check off tasks in PLAN.md as you complete them."
```
