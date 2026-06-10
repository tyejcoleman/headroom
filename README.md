# Headroom

**A resource-aware layer for coding agents.** It feeds the agent its two scarcest
resources in real time — account **rate-limit headroom** (5h / 7d windows) and session
**context headroom** (tokens before compaction) — so the model can plan work to fit,
spend efficiently, and use capacity that would otherwise expire.

> **Status: early / pre-validation.** The architecture is specified; we are confirming the
> two assumptions the whole thing rests on before building. See
> [`docs/VALIDATION.md`](docs/VALIDATION.md). License: Apache-2.0.

## The problem

Claude Code retries 429s silently and compacts context mid-task, so the model plans as if
both budgets were infinite. Subscription windows are use-it-or-lose-it; compaction breaks
task continuity. Existing tools (ccusage, dashboards, menu-bar apps) are human-facing and
retrospective — **nothing feeds either budget to the agent itself.**

## The thesis

Model-facing, real-time, planning-oriented. Two budgets, one state, injected into the
harness through **official extension points only**.

```
collectors                 state                     awareness connector → Claude Code
----------                 -----                     ---------------------------------
statusline tap   ─┐                                  push  UserPromptSubmit: ~40-token stamp
  rate_limits +   ├─▶ ~/.headroom/state.json ─▶            SessionStart(compact): re-inject handoff
  context_window  │   + burn rates, projections     pull  MCP: resource_state, fit_check
JSONL scanner    ─┘                                  policy SKILL.md: scope-to-fit planning
                                                     human statusline HUD
```

## Compliance posture

Headroom only uses surfaces Anthropic exposes on purpose: statusline stdin JSON, hooks,
MCP, OTel, and your own local session files. It **never** reuses subscription OAuth tokens
outside the official client, calls undocumented endpoints, spoofs harness identity, or
burns interactive quota headlessly. See the hard rules in [`CLAUDE.md`](CLAUDE.md).

## Roadmap

Five phases, scoped tasks with acceptance criteria in [`docs/PLAN.md`](docs/PLAN.md):
**P0** foundation (tap + state) · **P1** awareness connector (hooks + MCP + skill) ·
**P2** planner & checkpointing · **P3** beyond one harness (credit meter, Codex adapter,
RESOURCE-STATE spec) · **P4** governance & on-prem.

## Try the first test

The entire repo depends on one question: does the statusline payload actually carry
`rate_limits` and `context_window` on a real account? Settle it with the zero-cost spike:

```bash
# point your statusline at spikes/s0-dump-statusline.mjs, use Claude Code a few prompts, then:
tail -3 ~/.headroom/raw-sample.json
```

Full instructions and the decision gates are in [`docs/VALIDATION.md`](docs/VALIDATION.md).

## Contributing

This is built to be useful in anyone's setup, not just its author's. See
[`CONTRIBUTING.md`](CONTRIBUTING.md). The durable value is the **behavioral and governance
layer**, not the metering — that's where help is most welcome.

## License

[Apache-2.0](LICENSE).
