# Headroom

**Make your coding agent aware of its own budgets.** Headroom feeds Claude Code's two
scarcest resources — account **rate-limit headroom** (5h / 7d windows) and session
**context headroom** (tokens before compaction) — *to the agent itself*, so it plans work
that fits, spends efficiently, and stops wasting capacity that expires.

Every usage tool today (ccusage, dashboards, menu-bar apps) is human-facing and
retrospective. Headroom is **model-facing, real-time, and planning-oriented**: the model
plans differently because it knows.

```
collectors                state                      awareness connector → Claude Code
----------                -----                      ---------------------------------
statusline tap  ──▶  ~/.headroom/state.json  ──▶  push   UserPromptSubmit hook: tiny [headroom] stamp
 (rate_limits +       + burn rate,                 pull   MCP: resource_state · estimate_remaining · fit_check
  context_window)       projections               policy  skill: scope-to-fit planning rules
                                                   human   statusline HUD
```

Zero dependencies. Official extension points only (statusline, hooks, MCP). Apache-2.0.

## Install

```bash
git clone https://github.com/tyejcoleman/headroom && cd headroom
node bin/headroom.mjs install        # --dry-run to preview, uninstall to remove
```

This wires up, idempotently (and `uninstall` removes it all, restoring any statusline you
had):

1. **Statusline tap** — collects `rate_limits` + `context_window` from the payload Claude
   Code already pipes to statuslines, atomically writes `~/.headroom/state.json`, renders
   a HUD: `⛶ 5h 58%→14:00 · 7d 85% · ctx 19%(38k) · 9.8%/h · $0.47` (all percentages are
   **remaining**).
2. **Prompt stamp** — a `UserPromptSubmit` hook injects ~30 tokens of live budget context
   with each prompt: `[headroom] 5h: 58% left, resets 14:00 · 7d: 85% left · ctx: ~38k
   tokens before compaction`. Silent when data is missing or stale. Disable anytime with
   `HEADROOM_DISABLE=1`.
3. **MCP server** — read-only tools the model can pull: `resource_state`,
   `estimate_remaining`, and `fit_check({est_tokens})` → `fits | tight | exceeds | defer`.
4. **Skill** — the planning policy: size tasks against both budgets before starting,
   cheap-first under pressure, defer-past-reset with a resume plan, checkpoint before the
   compaction ceiling — and *never* defer when budgets are healthy.

Requires Claude Code ≥ 2.1.92 on a Pro/Max subscription for rate-limit data (`rate_limits`
appears in statusline payloads after the first response). On API-key auth Headroom
degrades gracefully to context-only awareness.

## Does it actually change behavior? We tested it.

Before building this, we ran agents through a [simulated-budget eval](eval/v1/): real repo,
real tools, a live budget burning down behind a `fit_check` CLI, graded from artifacts
(commits, test suites, journals — not self-reports). Across haiku and sonnet:

- **Naive agents** plowed through ~33k estimated tokens of work the window couldn't
  cover — work that dies at exhaustion in real life, including a mid-flight atomic migration.
- **Equipped agents** shipped exactly what fit, stopped on the DEFER verdict, and wrote
  reset-aware resume plans — while spending ~40% fewer tokens.
- On healthy budgets, equipped agents completed everything with no false caution.

Results and the reproducible harness: [`eval/v1/results/`](eval/v1/results/).

## The spec

`ResourceState v0` (schema in [`schema/`](schema/)) is provider-neutral on purpose — a
Codex adapter targeting `~/.codex/sessions` is on the [roadmap](docs/PLAN.md), and the
adapter contract will be published as RESOURCE-STATE spec v0.1.

## Compliance posture

Headroom uses only surfaces vendors expose on purpose: statusline stdin JSON, hooks, MCP,
OTel, and your own local files. It **never** reuses subscription OAuth tokens outside
official clients, calls undocumented endpoints, spoofs harness identity, or burns
interactive quota headlessly. Hard rules in [`CLAUDE.md`](CLAUDE.md).

## Project layout

- `bin/`, `src/` — the CLI: `tap`, `hook`, `mcp`, `install`, `status` (zero-dep ESM)
- `skill/SKILL.md` — the behavioral policy installed into Claude Code
- `schema/` — ResourceState v0 JSON Schema
- `eval/`, `eval/v1/` — the behavioral eval harnesses + results
- `docs/` — [one-pager](docs/ONE-PAGER.md) · [phased plan](docs/PLAN.md) · [validation gates](docs/VALIDATION.md)

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Most-wanted: real-world `rate_limits` payload
samples (`headroom tap --capture` appends raw payloads to `~/.headroom/raw-sample.jsonl`
— sanitize before sharing), burn-model improvements, and the Codex adapter.

## License

[Apache-2.0](LICENSE).
