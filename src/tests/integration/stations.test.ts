/**
 * Integration tests — Stations endpoints
 * TODO: Member 1 — implement.
 */

describe('GET /api/stations', () => {
  it.todo('200 — returns paginated stations');
  it.todo('200 — filters by type and status');
});

describe('GET /api/stations/nearby', () => {
  it.todo('200 — returns stations within radius');
  it.todo('400 — missing lat/lng');
});

describe('GET /api/stations/:id', () => {
  it.todo('200 — returns station details');
  it.todo('404 — station not found');
});

describe('POST /api/stations', () => {
  it.todo('201 — creates station (status:pending_review)');
  it.todo('401 — unauthenticated');
  it.todo('422 — invalid body');
});

describe('PATCH /api/stations/:id', () => {
  it.todo('200 — owner can update own station');
  it.todo('403 — cannot update other\'s station');
});

describe('DELETE /api/stations/:id', () => {
  it.todo('204 — soft-deletes station');
});

describe('PATCH /api/admin/stations/:id/approve', () => {
  it.todo('200 — admin approves station');
  it.todo('403 — non-admin cannot approve');
});

describe('PATCH /api/admin/stations/:id/reject', () => {
  it.todo('200 — admin rejects station with reason');
});
