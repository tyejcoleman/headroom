# API Reference — acme-platform v2

## Users

### GET /v2/users/{id}

Returns base user fields.

**Response:**
```json
{ "id": "u_123", "email": "alice@example.com", "name": "Alice" }
```

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
