/**
 * Integration tests — Reviews endpoints
 * TODO: Member 2 — implement.
 */

describe('GET /api/stations/:id/reviews', () => {
  it.todo('200 — returns paginated approved reviews');
});

describe('POST /api/stations/:id/reviews', () => {
  it.todo('201 — creates review for authenticated user');
  it.todo('409 — duplicate review for same station');
  it.todo('401 — unauthenticated');
});

describe('PATCH /api/reviews/:id', () => {
  it.todo('200 — author can update own review');
  it.todo('403 — non-author cannot update');
});

describe('DELETE /api/reviews/:id', () => {
  it.todo('204 — soft-deletes review');
});

describe('POST /api/reviews/:id/like', () => {
  it.todo('200 — toggles like');
});

describe('PATCH /api/admin/reviews/:id/moderate', () => {
  it.todo('200 — admin approves review');
  it.todo('200 — admin rejects review');
  it.todo('403 — non-admin cannot moderate');
});
