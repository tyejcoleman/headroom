# ResourceState v0 — the adapter contract

*T3.3 · This document is the contract: an adapter for any harness (Codex CLI, custom
agents, gateways) should be writable from this page alone. The machine-readable schema
is [`schema/resource-state.schema.json`](../schema/resource-state.schema.json); the
reference producer is `src/state.mjs` (Claude Code statusline payloads).*

## What it is

One JSON document at `~/.tokenroom/state.json` (override dir with `TOKENROOM_DIR`)
describing an account's **budget state right now**: rate-limit windows, session context
tokenroom, burn/velocity, session cost. Producers (adapters) write it; consumers (HUD,
stamps, MCP tools, dashboards) read it. The consumers in this repo work unchanged with
any producer that honors this contract.

## Write contract (hard rules)

1. **Atomic writes only:** write to a temp file in the same directory, then `rename()`.
   Consumers may read at any moment; a torn read must be impossible (ADR-5).
2. **Defensive production:** every upstream field may be absent, malformed, or buggy.
   Clamp percentages to 0–100 — anything else (including epoch values leaking into a
   percentage field) becomes `null`, never a crash, never a lie.
3. **Timestamps are epoch seconds.** Tolerate upstream milliseconds by dividing when
   `v > 1e12`.
4. **Remaining-first is a display rule, not a storage rule:** the file stores
   `used_pct` (what providers report); every human/model surface must render
   *remaining*. Eval-validated: "X% used" gets misread as X% left.
5. **Never fabricate.** A field you can't source is `null`/omitted. Estimates carry an
   `est_` prefix or live under `burn`, and displays must mark them `≈`.

## Document shape

```jsonc
{
  "schema": "resource-state/v0",        // required, exactly this string for v0
  "updated_at": 1781100000,             // epoch sec of this write — consumers staleness-guard on it
  "provider": "anthropic",              // "anthropic" | "openai" | your provider id
  "auth": "subscription",               // "subscription" | "api-key" | "unknown"
  "session_id": "abc-123",              // the session this write came from, or null

  "windows": {                          // rate-limit windows; omit keys you don't have
    "five_hour": { "used_pct": 42, "resets_at": 1781110000 },
    "seven_day": { "used_pct": 28, "resets_at": 1781500000 }
  },

  "context": {                          // SESSION-scoped (see scoping below) or null
    "window_size": 1000000,             // tokens; varies by model — never hardcode
    "used_pct": 24,
    "compact_ceiling_pct": 80,          // where compaction triggers (config/env-derived)
    "tokens_to_ceiling": 560000         // real tokens, computed, not estimated
  },

  "burn": {                             // derived velocity; ALL fields nullable
    "pct_per_hour": 9.1,
    "projected_exhaustion": 1781106000, // null unless meaningfully projectable; consumers
                                        // warn only when it lands BEFORE resets_at
    "out_per_min_10m": 4100,            // recent token flow (if the harness exposes usage)
    "tokens_per_pct": 5200,             // learned window denominator (≈, empirical)
    "est_tokens_left": 230000,          // (100−used)×tokens_per_pct — display with ≈
    "exhaustion_band": [1781104000, 1781109000]  // [fast-rate, slow-rate] estimates
  },

  "session": { "cost_usd": 12.50 },     // session-scoped; null when unknown
  "mode": "ondemand"                    // governor mode echo (performance|ondemand|powersave)
}
```

## Scoping (the rule that prevents lying across sessions)

- `windows` are **account-level**: true for every session OF THE SAME ACCOUNT. Safe to show
  to any same-account session; when concurrent sessions span DIFFERENT accounts the state is
  isolated per account under `~/.tokenroom/accounts/<key>/` and a session reads only its own
  (ADR-21) — the payload has no account id, so they cannot otherwise be told apart.
- `context`, `session`, and `session_id` are **session-level**. The file is
  last-writer-wins across concurrent sessions, so consumers MUST compare the reader's
  session id against `session_id` before presenting session-scoped fields, and omit them
  on mismatch (ADR-7). If your adapter can't know a session id, write `null` — consumers
  then treat session-scoped fields as unverified.

## Consumer contract

- Staleness-guard on `updated_at`: tokenroom's surfaces go silent past 30 minutes and
  disclose age past 2 (silence beats a stale number presented as live).
- Warn on exhaustion ONLY when the projection lands before `resets_at`.
- Treat `burn.*` as heuristic; `context.tokens_to_ceiling` as real.

## Versioning

`resource-state/v0` evolves **additively only** — new optional fields may appear; no
field changes meaning or type. Anything breaking becomes `resource-state/v1` under a new
`schema` value, and consumers in this repo will read both during a deprecation window.
Validate against the JSON Schema in CI; `src/schema.mjs` is the zero-dep reference
validator.

## Writing an adapter (checklist)

1. Find your harness's budget surface (e.g. Codex CLI session files, or
   `anthropic-ratelimit-*` response headers for direct API use).
2. Map to the shape above; apply the write contract (atomic, clamped, nulls over guesses).
3. Set `provider`/`auth` truthfully; omit what you don't have.
4. Validate: `node --input-type=module -e "import('./src/schema.mjs').then(async m => console.log(m.validateResourceState(JSON.parse(require('fs').readFileSync(process.env.HOME+'/.tokenroom/state.json','utf8')))))"` → `[]`.
5. Everything downstream — HUD, `tokenroom watch`/`line`, stamps, MCP tools, audit —
   works without modification. That's the point.

Fixture donations from other providers/plans are the most valuable contribution:
`tokenroom tap --capture` (sanitize!) → issue template `payload_sample`.
