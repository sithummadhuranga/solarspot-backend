# Station API — Postman Testing Guide

## 1. Start the Server

The server runs inside Docker. If it's not already running:

```bash
docker compose up -d
```

> Docker compose maps the API to **5000** on your host.
> Verify: `docker ps` — you should see `solarspot_backend` running.

**Health check:**
```bash
curl http://localhost:5000/api/health
```

---

## 2. Seed the Database (first time or to reset)

```bash
MONGODB_URI=mongodb://localhost:27017/solarspot_dev \
MONGODB_DB_NAME=solarspot_dev \
npm run seed:dev
```

This drops and recreates:
- **10 roles** (guest → admin)
- **4 test users** with JWT tokens printed to console
- **10 Sri Lanka stations** (6 active, 3 pending, 1 rejected)

Copy the tokens from the output — you'll need them below.

---

## 3. Postman Environment Variables

Create a Postman Environment called `SolarSpot Dev` with these variables:

| Variable | Value |
|---|---|
| `base_url` | `http://localhost:5000/api` |
| `admin_token` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YTA2Zjk5YTA2ZDdiYjNiYzU0NTJmMCIsImlhdCI6MTc3MjEyMjAxMCwiZXhwIjoxNzcyNzI2ODEwfQ.HsY_JAsku9TTsTfmEUQoiOig0J6ZsxQbHZu9nOKGrqQ` |
| `mod_token` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YTA2Zjk5YTA2ZDdiYjNiYzU0NTJmMyIsImlhdCI6MTc3MjEyMjAxMCwiZXhwIjoxNzcyNzI2ODEwfQ.qBfPOQaDtJORX9UrxYQnZg6mMuuT7RejXoTchXOJAZ8` |
| `owner_token` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YTA2ZjlhYTA2ZDdiYjNiYzU0NTJmNiIsImlhdCI6MTc3MjEyMjAxMCwiZXhwIjoxNzcyNzI2ODEwfQ.Mn5w-cNMsSL23DMk-Wj0DtMABLYtIwPUYV6rsfBsUa4` |
| `user_token` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YTA2ZjlhYTA2ZDdiYjNiYzU0NTJmOSIsImlhdCI6MTc3MjEyMjAxMCwiZXhwIjoxNzcyNzI2ODEwfQ.O4auH68QUgIKp3riEXIT-RwypLdUK03bZHJAy1-a2F0` |
| `active_id` | `69a06f9aa06d7bb3bc5452fc` |
| `pending_id` | `69a06f9aa06d7bb3bc545302` |

**All seeded station IDs:**

| Status | Name | ID |
|---|---|---|
| active | Galle Face Colombo | `69a06f9aa06d7bb3bc5452fc` |
| active | Kandy City Centre | `69a06f9aa06d7bb3bc5452fd` |
| active | Galle Fort | `69a06f9aa06d7bb3bc5452fe` |
| active | Negombo Beach Road | `69a06f9aa06d7bb3bc5452ff` |
| active | Anuradhapura Heritage | `69a06f9aa06d7bb3bc545300` |
| active | Ratnapura Gem City | `69a06f9aa06d7bb3bc545301` |
| pending | Trincomalee Harbour | `69a06f9aa06d7bb3bc545302` |
| pending | Kurunegala Rock Fort | `69a06f9aa06d7bb3bc545303` |
| pending | Jaffna Point Pedro | `69a06f9aa06d7bb3bc545304` |
| rejected | Batticaloa Lagoon | `69a06f9aa06d7bb3bc545305` |

In Postman, set `Authorization → Bearer Token → {{admin_token}}` as needed per request.

---

## 4. Test Credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@solarspot.app` | `Admin@2026!` |
| Moderator | `mod@solarspot.app` | `Mod@2026!` |
| Station Owner | `owner@solarspot.app` | `Owner@2026!` |
| Regular User | `user@solarspot.app` | `User@2026!` |

---

## 5. API Endpoints

### Public (no token needed)

---

#### `GET {{base_url}}/stations`
List all active stations with pagination.

**Query params (all optional):**
| Param | Type | Example | Notes |
|---|---|---|---|
| `page` | number | `1` | default: 1 |
| `limit` | number | `10` | max: 100 |
| `search` | string | `kandy` | full-text search |
| `lat` | number | `6.9271` | filter by location |
| `lng` | number | `79.8612` | required if lat provided |
| `radius` | number | `50` | km, default: 25 |
| `connectorType` | string | `CCS` | one of: `USB-C`, `Type-2`, `CCS`, `CHAdeMO`, `Tesla-NACS`, `AC-Socket` |
| `minRating` | number | `3.5` | 0–5 |
| `isVerified` | boolean | `true` | |
| `amenities` | string | `wifi` | single value |
| `sortBy` | string | `rating` | `newest`, `rating`, `distance`, `featured` |

**Expected response:**
```json
{
  "success": true,
  "data": [ ...stations ],
  "pagination": { "page": 1, "limit": 10, "total": 6, "totalPages": 1, ... }
}
```

---

#### `GET {{base_url}}/stations/nearby?lat=6.9271&lng=79.8612&radius=200`
Stations near a coordinate, sorted by distance. Returns `distanceKm` on each result.

**Required query params:** `lat`, `lng`
**Optional:** `radius` (km, default 10), `limit` (default 20)

---

#### `GET {{base_url}}/stations/search?q=galle`
Full-text search across name, description, and city.

**Required:** `q`
**Optional:** `page`, `limit`, `sortBy` (`newest`, `rating`, `featured`)

---

#### `GET {{base_url}}/stations/{{active_id}}`
Get a single active station by ID.

> Pending/rejected stations return **404** from this public endpoint.

---

### Authenticated (any logged-in user)

Set `Authorization: Bearer {{user_token}}` (or any token)

---

#### `POST {{base_url}}/stations`
Submit a new station for review. Status starts as `pending`.

**Headers:** `Content-Type: application/json`, `Authorization: Bearer {{user_token}}`

**Body:**
```json
{
  "name": "Test Solar Station",
  "description": "A test station for Postman",
  "addressString": "Galle Road, Colombo 03, Sri Lanka",
  "connectors": [
    { "type": "CCS", "powerKw": 50, "count": 2 },
    { "type": "Type-2", "powerKw": 22, "count": 4 }
  ],
  "solarPanelKw": 150,
  "amenities": ["wifi", "parking", "restroom"],
  "operatingHours": {
    "alwaysOpen": false,
    "schedule": [
      { "day": "Mon", "openTime": "08:00", "closeTime": "20:00" },
      { "day": "Tue", "openTime": "08:00", "closeTime": "20:00" },
      { "day": "Sat", "openTime": "09:00", "closeTime": "18:00" }
    ]
  }
}
```

Or provide coordinates directly instead of `addressString`:
```json
{
  "lat": 6.9271,
  "lng": 79.8612
}
```

**Valid connector types:** `USB-C`, `Type-2`, `CCS`, `CHAdeMO`, `Tesla-NACS`, `AC-Socket`
**Valid amenities:** `wifi`, `cafe`, `restroom`, `parking`, `security`, `shade`, `water`, `repair_shop`, `ev_parking`

**Returns:** 201 with the created station (status = `pending`)

---

#### `PUT {{base_url}}/stations/{{active_id}}`
Update a station. Any subset of fields.

**Headers:** `Authorization: Bearer {{owner_token}}`

**Body (all optional, but at least one required):**
```json
{
  "name": "Updated Station Name",
  "solarPanelKw": 200,
  "amenities": ["wifi", "parking", "cafe"]
}
```

---

#### `DELETE {{base_url}}/stations/{{active_id}}`
Soft-delete a station (sets `isActive: false`). Station disappears from public listing.

**Headers:** `Authorization: Bearer {{admin_token}}`

---

#### `GET {{base_url}}/stations/{{active_id}}/stats`
Station stats: rating, review count, featured status, verification info.

**Headers:** `Authorization: Bearer {{user_token}}`

---

### Moderation (moderator or admin token)

---

#### `GET {{base_url}}/stations/pending`
List all stations awaiting approval.

**Headers:** `Authorization: Bearer {{mod_token}}`

**Optional query:** `page`, `limit`

---

#### `PATCH {{base_url}}/stations/{{pending_id}}/approve`
Approve a pending station. Sets status → `active`, `isVerified: true`.

**Headers:** `Authorization: Bearer {{mod_token}}`

**Body:** *(none required)*

---

#### `PATCH {{base_url}}/stations/{{pending_id}}/reject`
Reject a pending station.

**Headers:** `Authorization: Bearer {{mod_token}}`

**Body:**
```json
{
  "rejectionReason": "Location coordinates could not be verified. Please resubmit with accurate address."
}
```

> `rejectionReason` must be at least 10 characters.

---

#### `PATCH {{base_url}}/stations/{{active_id}}/feature`
Toggle featured status on an active station.

**Headers:** `Authorization: Bearer {{admin_token}}`

**Body:** *(none)*

Returns the updated station with `isFeatured: true` or `false`.

---

## 6. Quick Test Sequence

Run these in order to test the full workflow:

1. `GET /stations` — see 6 active stations
2. `GET /stations/nearby?lat=6.9271&lng=79.8612&radius=200` — same 6 with distances
3. `GET /stations/search?q=kandy` — find Kandy station
4. `POST /stations` (user token) — create a new pending station, copy the `_id`
5. `GET /stations/pending` (mod token) — see your new station listed
6. `PATCH /stations/:newId/approve` (mod token) — approve it
7. `GET /stations` — now 7 active stations
8. `PATCH /stations/:newId/feature` (admin token) — feature it
9. `GET /stations?sortBy=featured` — featured station appears first
10. `DELETE /stations/:newId` (admin token) — soft delete, back to 6

---

## 7. Error Reference

| Status | Code | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | Missing/invalid fields |
| 401 | `UNAUTHORIZED` | No token or token expired |
| 403 | `FORBIDDEN` | Token valid but insufficient role |
| 404 | `NOT_FOUND` | Station doesn't exist or is deleted/pending |
| 422 | `UNPROCESSABLE` | Joi validation failed — check `errors` array |
| 500 | `INTERNAL` | Server error — check Docker logs |

**Check Docker logs:**
```bash
docker logs solarspot_backend --tail 50 -f
```
