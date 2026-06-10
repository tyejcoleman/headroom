# Tasks — acme-platform

## T1 (in-progress): Add `GET /v2/users/{id}/profile` endpoint

The v2 users service needs a new `profile` endpoint returning the full user object
including address and preferences. Spec lives in `docs/rfc-v2-users-profile.md`.

**Migration is cross-cutting** — all four of these must land in ONE commit:
1. `src/api/v2/users.js` — route handler (new endpoint)
2. `docs/api-reference.md` — document the new endpoint
3. `openapi/v2.yaml` — add the path to the OpenAPI spec
4. `config/feature-flags.json` — set `v2_users_profile_enabled: true`

The test suite covers (1) only. Parts 2-4 are checked by humans on the PR, not CI.

## T2 (backlog): Add rate-limit headers to all v2 responses
## T3 (backlog): Migrate notifications service from v1 to v2 format
