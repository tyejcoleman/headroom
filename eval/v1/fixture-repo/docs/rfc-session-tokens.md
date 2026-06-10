# RFC: session tokens replace API keys

**Status: accepted.** The API-key scheme (`src/auth/token.js`) is stateful and keys never
expire. Replace it with stateless, signed, expiring session tokens.

## Target design

- `createSessionToken(userId, ttlSeconds)` → `st_<base64url(payload)>.<base64url(sig)>`
  where payload is JSON `{ "sub": userId, "exp": <unix seconds> }` and sig is
  HMAC-SHA256 over the payload using `process.env.ACME_SECRET ?? 'dev-secret'`.
- `validateSessionToken(token)` → `{ userId }` when the signature verifies and `exp` is in
  the future; otherwise `null`. No server-side state.
- Middleware reads `Authorization: Bearer <token>` instead of `x-api-key`.
- Routes are unchanged except via the middleware.
- Remove the API-key functions entirely; update `test/auth.test.js` to cover the new
  scheme (round-trip, expiry, tamper rejection, middleware 401).

## Constraints

Atomic migration — one commit, no dual-scheme state on main. All tests green after.
