# Evaluation 01 — Swagger Testing Guide

> **Swagger UI:** http://localhost:5001/api/docs  
> **Mongo Express:** http://localhost:8081  
> **Coverage:** Station Management module (your individual contribution)

---

## Demo Users Reference

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@solarspot.app` | `Admin@2026!` |
| Moderator | `mod@solarspot.app` | `Mod@2026!` |
| Station Owner | `owner@solarspot.app` | `Owner@2026!` |
| Regular User | `user@solarspot.app` | `User@2026!` |

---

## PART 1 — Authentication

### Step 1 — Register a new user
**`POST /auth/register`**

```json
{
  "displayName": "Sathush Demo",
  "email": "sathush@demo.com",
  "password": "Demo@2026!"
}
```

Expected: `201 Created` ✅

---

### Step 2 — Login and get JWT token
**`POST /auth/login`**

```json
{
  "email": "sathush@demo.com",
  "password": "Demo@2026!"
}
```

1. Copy the `accessToken` from the response
2. Click the **Authorize 🔓** button at the top of Swagger UI
3. Paste the token → click **Authorize**

Expected: `200 OK` ✅

---

## PART 2 — Station Management (Individual Module)

### Step 3 — Create a Station
**`POST /api/stations`** _(requires auth)_

```json
{
  "name": "Solar Hub Colombo",
  "description": "Clean solar-powered EV charging in the heart of Colombo.",
  "addressString": "Galle Rd, Colombo 03, Sri Lanka",
  "lat": 6.9271,
  "lng": 79.8612,
  "connectors": [
    { "type": "Type-2", "powerKw": 22, "count": 4 },
    { "type": "USB-C",  "powerKw": 3.5, "count": 2 }
  ],
  "solarPanelKw": 15,
  "amenities": ["wifi", "parking", "shade"],
  "operatingHours": {
    "alwaysOpen": false,
    "schedule": [
      { "day": "Monday",   "openTime": "07:00", "closeTime": "21:00" },
      { "day": "Tuesday",  "openTime": "07:00", "closeTime": "21:00" },
      { "day": "Saturday", "openTime": "08:00", "closeTime": "18:00" }
    ]
  }
}
```

Expected: `201 Created`, `status: "pending"` ✅  
**Copy the `_id` from the response — you'll need it for all following steps.**

---

### Step 4 — List All Active Stations (public, no auth)
**`GET /api/stations`**

Try with query filters:
- `sortBy = rating`
- `connectorType = Type-2`
- `page = 1`, `limit = 10`

Expected: `200 OK` with paginated list ✅

---

### Step 5 — Get Station by ID
**`GET /api/stations/{id}`**

- `id` = the `_id` from Step 3

Expected: `200 OK` with full station document ✅

---

### Step 6 — Search Stations (full-text)
**`GET /api/stations/search`**

- `q = Solar`

Expected: `200 OK` with matching stations ✅

---

### Step 7 — Find Nearby Stations
**`GET /api/stations/nearby`**

- `lat = 6.9271`
- `lng = 79.8612`
- `radius = 10`

Expected: `200 OK`, stations sorted by `distanceKm` ✅

---

## PART 3 — Moderation Flow (Role-Based Access Control)

### Step 8 — Login as Moderator
**`POST /auth/login`**

```json
{
  "email": "mod@solarspot.app",
  "password": "Mod@2026!"
}
```

Re-authorize in Swagger with the new `accessToken`.

---

### Step 9 — View Pending Stations
**`GET /api/stations/pending`** _(Moderator+ only)_

Expected: `200 OK` — your station from Step 3 appears here ✅

---

### Step 10 — Approve the Station
**`PATCH /api/stations/{id}/approve`**

- `id` = station `_id` from Step 3

Expected: `200 OK`, `status: "active"` ✅

---

### Step 11 — Feature the Station
**`PATCH /api/stations/{id}/feature`**

Expected: `200 OK`, `isFeatured: true` ✅

---

### Step 12 — Update Station (switch back to your user)
Login again as `sathush@demo.com` and re-authorize, then:

**`PUT /api/stations/{id}`**

```json
{
  "description": "Updated — now with 6 EV charging bays and expanded solar array.",
  "solarPanelKw": 20
}
```

Expected: `200 OK` with updated document ✅

---

### Step 13 — Get Station Stats
**`GET /api/stations/{id}/stats`**

Expected: `200 OK` with `{ rating, reviewCount, isFeatured, isVerified }` ✅

---

## PART 4 — Error Handling Demos (Best Practices)

### Step 14 — 403 Forbidden (wrong role)
While logged in as a regular user, call:

**`GET /api/stations/pending`**

Expected: `403 Forbidden` ✅ — demonstrates RBAC is working

---

### Step 15 — 422 Validation Error (missing fields)
**`POST /api/stations`** with invalid/incomplete body:

```json
{
  "name": "X"
}
```

Expected: `422 Unprocessable Entity` with detailed errors array ✅

---

### Step 16 — 401 Unauthorized (no token)
Remove authorization, then call:

**`POST /api/stations`**

Expected: `401 Unauthorized` ✅

---

## PART 5 — MongoDB Integration Demo

1. Open **http://localhost:8081** (Mongo Express)
2. Navigate to the `solarspot` database → `stations` collection
3. Show the document created in Step 3 with all fields populated
4. Show the status change from `pending` → `active` after Step 10

---

## Evaluation Rubric Checklist

| Criterion | Marks | What to demonstrate |
|-----------|-------|---------------------|
| Core Functionalities — 4+ API endpoints | 40 | Steps 3–13 cover 10 endpoints |
| MongoDB integration established | 20 | Live data in Mongo Express + Swagger responses |
| Clean code structure & best practices | 10 | Show `controller → service → model` split in VS Code |
| Architecture, schema, API design (group) | 20 | Show `station.model.ts`, Swagger docs, middleware chain |
| Presentation & Communication | 10 | Walk through this guide clearly |

---

## Connector Types Reference

`USB-C` · `Type-2` · `CCS` · `CHAdeMO` · `Tesla-NACS` · `AC-Socket`

## Amenities Reference

`wifi` · `cafe` · `restroom` · `parking` · `security` · `shade` · `water` · `repair_shop` · `ev_parking`

## Sort Options

`newest` · `rating` · `distance` · `featured`
