# GET /v2/orders

Returns all orders in the system, paginated.

**Auth:** session cookie.

**Query params:** `page` (default 1), `size` (default 10).

**Response:**

```json
{ "data": [ { "id": "o1", "user": "u1", "amount_cents": 1200 } ], "total": 3 }
```
