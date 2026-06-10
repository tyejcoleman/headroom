---
description: Add a statusline payload fixture + tests for a newly observed shape or failure mode
argument-hint: [path to captured payload or description of the anomaly]
---

Add a payload fixture for: $ARGUMENTS

The fixture corpus (`test/fixtures/`) is the foundation of ADR-5 (degrade, never crash).
Every payload shape observed in the wild — especially broken ones — becomes a fixture.

1. **Sanitize** the payload: replace `session_id`, paths, and any identifying values with
   synthetic ones; keep the *structural* anomaly byte-faithful (that's the point).
2. Save as `test/fixtures/statusline-<short-name>.json` with a name describing the shape
   (e.g. `statusline-epoch-leak.json`, not `statusline-bug3.json`).
3. Add assertions to `test/state.test.mjs`: what `parsePayload` must produce — bad fields
   become `null` (never crash, never out-of-range), good fields survive, and the result
   validates against the schema (`validateResourceState` → `[]`).
4. If the tap/hook surface behavior changes (HUD/stamp text), cover it in `test/cli.test.mjs`.
5. `npm test` green; mention the fixture in the PR with where/how the payload was observed
   (Claude Code version, plan, model).
