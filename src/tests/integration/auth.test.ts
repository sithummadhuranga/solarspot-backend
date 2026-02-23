/**
 * Integration tests — Auth endpoints
 * TODO: Member 4 — implement using supertest + mongoose-memory-server.
 * Ref: MASTER_PROMPT.md → Testing → Integration tests hit actual Express router + in-memory DB
 */

describe('POST /api/auth/register', () => {
  it.todo('201 — returns user + sends verification email');
  it.todo('409 — duplicate email');
  it.todo('422 — invalid request body');
});

describe('POST /api/auth/login', () => {
  it.todo('200 — returns access token, sets httpOnly refresh cookie');
  it.todo('401 — wrong password');
  it.todo('401 — email not verified');
});

describe('POST /api/auth/logout', () => {
  it.todo('204 — clears refresh cookie');
  it.todo('401 — unauthenticated');
});

describe('POST /api/auth/refresh', () => {
  it.todo('200 — returns new access token and rotates refresh cookie');
  it.todo('401 — invalid/missing refresh cookie');
});

describe('GET /api/auth/verify-email/:token', () => {
  it.todo('200 — marks user as verified');
  it.todo('400 — expired token');
});

describe('POST /api/auth/forgot-password', () => {
  it.todo('200 — always succeeds (no email leakage)');
});

describe('PATCH /api/auth/reset-password/:token', () => {
  it.todo('200 — updates password, invalidates all refresh tokens');
  it.todo('400 — expired token');
});
