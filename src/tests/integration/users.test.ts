/**
 * Integration tests — Users endpoints
 * TODO: Member 4 — implement.
 */

describe('GET /api/users/me', () => {
  it.todo('200 — returns own profile');
  it.todo('401 — unauthenticated');
});

describe('PATCH /api/users/me', () => {
  it.todo('200 — updates name/avatar');
  it.todo('422 — invalid input');
});

describe('DELETE /api/users/me', () => {
  it.todo('204 — soft-deletes account');
});

describe('GET /api/admin/users', () => {
  it.todo('200 — returns paginated users (admin)');
  it.todo('403 — non-admin cannot access');
});

describe('PATCH /api/admin/users/:id', () => {
  it.todo('200 — admin updates user role');
  it.todo('403 — non-admin cannot update');
});
