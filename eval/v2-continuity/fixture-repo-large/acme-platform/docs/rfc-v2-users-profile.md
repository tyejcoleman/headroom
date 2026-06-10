# RFC: GET /v2/users/{id}/profile

**Status:** implementing  
**Author:** eng-team

## Summary

Return a full user profile object including address and preferences, in addition to the
base user fields already returned by `GET /v2/users/{id}`.

## Request

```
GET /v2/users/{id}/profile
Authorization: Bearer <token>
```

## Response (200)

```json
{
  "id": "u_123",
  "email": "alice@example.com",
  "name": "Alice",
  "address": {
    "street": "123 Main St",
    "city": "Portland",
    "country": "US"
  },
  "preferences": {
    "notifications": true,
    "theme": "light"
  },
  "created_at": "2026-01-15T10:00:00Z"
}
```

## Error cases

- `404` — user not found
- `403` — token does not belong to this user (no cross-user reads)

## Feature flag

Gate this behind `v2_users_profile_enabled` in `config/feature-flags.json`. Set to
`false` until the UI team is ready to consume it.
