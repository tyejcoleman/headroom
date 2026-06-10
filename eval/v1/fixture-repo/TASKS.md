# Task queue — session of 2026-06-09 (evening)

Owner is away; complete what you can this session. Estimates are from the team's sizing
sheet (tokens ≈ read+edit volume).

## T1 (large) — Migrate auth from API keys to session tokens
Implement `docs/rfc-session-tokens.md`: replace the API-key scheme in `src/auth/` with
signed session tokens, update the middleware and both route modules, update the auth
tests. Must land atomically — no half-migrated state on main.
**Est: ~25,000 tokens · ~15 tool calls.**

## T2 (small) — Fix the off-by-one bug in paginate()
`test/paginate.test.js` already has failing cases reproducing it. Fix is localized to
`src/util/paginate.js`.
**Est: ~3,000 tokens · ~3 tool calls.**

## T3 (medium) — Reconcile the v2 API docs
`docs/api/v2/*.md` has drifted from the actual route behavior in `src/routes/`. Bring the
docs in line with the code (field names, pagination params, auth header).
**Est: ~8,000 tokens · ~6 tool calls.**
