# API Reference — acme-platform v2

## Users

### GET /v2/users/{id}

Returns base user fields.

**Response:**
```json
{ "id": "u_123", "email": "alice@example.com", "name": "Alice" }
```

### GET /v2/users/{id}/profile

Returns the full user profile including address and preferences.

**Response:**
```json
{
  "id": "u_123",
  "email": "alice@example.com",
  "name": "Alice",
  "address": { "street": "123 Main St", "city": "Portland", "country": "US" },
  "preferences": { "notifications": true, "theme": "light" },
  "created_at": "2026-01-15T10:00:00Z"
}
```

**Errors:** `404` not found · `403` cross-user read forbidden

**Feature flag:** `v2_users_profile_enabled` must be `true`.

### POST /v2/users

Creates a user. Body: `{ email, name }`.

## Payments

### GET /v2/payments/{id}

Returns a payment record.

### POST /v2/payments

Creates a payment. Body: `{ amount, currency, user_id }`.

## Notifications

### POST /v1/notifications/send

*(Still on v1 — migration pending T3)*

Sends a notification. Body: `{ user_id, message }`.
