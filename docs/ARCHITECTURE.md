# Architecture

One page; module-level truth. Decisions and their *why*s live in `DECISIONS.md` —
this doc is *what talks to what*.

## Data flow

```
Claude Code                      headroom                            consumers
───────────                      ────────                            ─────────
statusline render ──stdin──▶ tap ──▶ ~/.headroom/state.json ◀──read── MCP server (4 tools)
                              │      ~/.headroom/history.jsonl        UserPromptSubmit hook → stamp
                              └──▶ HUD line (stdout)                  SessionStart hook → re-inject
PreCompact event ──stdin──▶ pre-compact hook ──▶ ~/.headroom/handoffs/<session>.json
plan_resume (MCP) ────────────────────────────▶ ~/.headroom/resume.json
```

Everything is event-driven off official surfaces; there is no daemon, no polling, no
network (ADR-1). Each invocation is a fresh short-lived node process.

## Module map

| File | Responsibility | Key invariants |
|---|---|---|
| `bin/headroom.mjs` | CLI dispatch only — no logic | unknown commands print help, hooks exit silently |
| `src/tap.mjs` | statusline entry: parse → persist → HUD | never crashes, always prints (ADR-5); `--capture` appends raw payloads |
| `src/state.mjs` | payload → ResourceState; burn model; atomic state I/O | clamp/null bad fields; median-of-buckets burn ≥10min baseline (ADR-4/5) |
| `src/hud.mjs` | human one-liner | remaining-first (ADR-3); actionable signals only (ADR-4) |
| `src/hook.mjs` | UserPromptSubmit stamp · PreCompact snapshot/guard · SessionStart re-inject · PostCompact log | session-scoping (ADR-7); age disclosure; silence > lying; guard fail-open (ADR-13) |
| `src/handoff.mjs` | ground-truth snapshot capture/render + transcript extracts | facts not prose (ADR-8); 6h staleness guard; pointer not payload (ADR-11) |
| `src/pins.mjs` | must-survive-verbatim facts, re-injected after compaction | capped + TTL'd (ADR-12) |
| `src/events.mjs` | compaction event log + silent-cliff detection | best-effort only; never breaks tap/hooks (ADR-5) |
| `src/resume.mjs` | deferred-work plan lifecycle | 24h expiry; single file |
| `src/fit.mjs` | fit_check + estimate_remaining verdict logic | context = real tokens; window = labeled heuristic |
| `src/mcp.mjs` | stdio MCP server (newline JSON-RPC) | read-only + one write surface (ADR-6); version from package.json (ADR-10) |
| `src/install.mjs` | settings.json merge, skill copy, MCP registration | idempotent; backup/restore; refuses npx cache; uninstall leaves no trace |
| `src/schema.mjs` + `schema/*.json` | ResourceState v0 validation | hand validator mirrors the JSON Schema |
| `skill/SKILL.md` | the behavioral policy installed into Claude Code | wording is eval-tested — change only with eval evidence (ADR-9) |
| `scripts/check-invariants.mjs` | the hard gates | cites ADR numbers; <100ms |

## Runtime files (`~/.headroom/`)

`state.json` (ResourceState v0, atomic) · `history.jsonl` (burn samples, self-pruning) ·
`handoffs/<session>.json` (pre-compaction snapshots) · `handoffs/<session>.extracts.json`
(verbatim transcript extracts, ADR-11) · `resume.json` (deferred-work plan) · `pins.json`
(must-survive facts, ADR-12) · `events.jsonl` (compaction lifecycle + context anomalies,
capped) · `config.json` (user config: `stamp_enabled`, `ceiling_pct`, `mode`,
`compact_guard_min`) · `raw-sample.jsonl` (only with `tap --capture`).

## Extension points

- **New provider adapter** (e.g. Codex): a collector that writes valid ResourceState with
  `provider: "openai"` — schema is the contract; see PLAN T3.2/T3.3.
- **New MCP tool:** add to `TOOLS` + dispatch in `src/mcp.mjs`; a write surface needs an ADR.
- **New hook:** handler in `src/hook.mjs`, dispatch in `bin/`, registration pair in
  `src/install.mjs` `HOOK_EVENTS` (uninstall handles any event automatically).
- **Skill/stamp wording:** behavioral claims require an eval round first (ADR-9) —
  harnesses in `eval/` are reusable (v0 cheap probes, v1 execution, v2 continuity).

## Testing strategy

Unit + spawn-based CLI tests (`test/`, node:test, no mocks — real processes, temp
`HEADROOM_DIR`s, real git repos); a fixture corpus for every observed payload shape
(add one per new failure mode — see `/add-fixture`); invariant gates in the same suite;
behavioral eval harnesses in `eval/` for anything claiming to change model behavior.
