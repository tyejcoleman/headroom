# GET /v2/users

Returns the user directory, paginated.

**Auth:** session cookie.

**Query params:** `page` (default 1), `size` (default 10).

**Response:**

```json
{ "data": [ { "id": "u1", "name": "Ada" } ], "total": 5 }
```
