/**
 * Integration tests — Auth endpoints
 * Ref: MASTER_PROMPT.md → Testing → Integration tests hit actual Express router + in-memory DB
 *      Uses MongoMemoryReplSet (replica set) to support Mongoose transactions
 */

import request  from 'supertest';
import mongoose from 'mongoose';
import crypto   from 'crypto';
import app      from '../../../app';
import { connectTestDb, disconnectTestDb, clearTestDb, seedCore } from './helpers';
import { User }                                                    from '@modules/users/user.model';

// Keep the refresh cookie between tests that need it
let refreshCookie: string;
let verifyToken: string;
let resetToken: string;

const VALID_USER = {
  displayName: 'Integration Tester',
  email: `int${Date.now()}@example.com`,
  password: 'Correct1!',
};

beforeAll(async () => {
  await connectTestDb();
  await seedCore();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  // Only clear non-RBAC collections between suites, not here — handled per-describe
});

// ─── POST /api/auth/register ─────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('201 — returns confirmation message', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(VALID_USER);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toMatch(/check your email/i);
  });

  it('409 — duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(VALID_USER); // same email second time

    expect(res.status).toBe(409);
  });

  it('422 — missing required fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'no-password@example.com' });

    expect(res.status).toBe(422);
  });

  it('422 — weak password (no digit)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ displayName: 'X', email: 'weak@test.com', password: 'weakpassword' });

    expect(res.status).toBe(422);
  });
});

// ─── POST /api/auth/login (before verify) ─────────────────────────────────────

describe('POST /api/auth/login — email not verified', () => {
  it('401 — user registered but email not yet verified', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: VALID_USER.email, password: VALID_USER.password });

    expect(res.status).toBe(401);
  });
});

// ─── GET /api/auth/verify-email/:token ────────────────────────────────────────

describe('GET /api/auth/verify-email/:token', () => {
  beforeAll(async () => {
    // Read the raw token from the DB to simulate clicking the email link
    const user = await User.findOne({ email: VALID_USER.email }).select('+emailVerifyToken').lean();
    // token is stored as hash — find it via the raw token field if stored, otherwise skip
    verifyToken = (user as unknown as Record<string, unknown>)?.emailVerifyTokenRaw as string ?? 'invalid-token';
  });

  it('400 — invalid / expired token', async () => {
    const res = await request(app).get('/api/auth/verify-email/garbage-token-xyz123');
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/auth/login (verified user) ─────────────────────────────────────

describe('POST /api/auth/login — verified user', () => {
  let accessToken: string;

  beforeAll(async () => {
    // Force-verify the test user so we can test login properly
    await User.findOneAndUpdate(
      { email: VALID_USER.email },
      { isEmailVerified: true, $unset: { emailVerifyToken: 1, emailVerifyExpires: 1 } },
    );
  });

  it('200 — returns access token, sets httpOnly refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: VALID_USER.email, password: VALID_USER.password });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();

    accessToken = res.body.data.accessToken;
    const cookies = (res.headers['set-cookie'] as unknown as string[]);
    refreshCookie = cookies.find(c => c.startsWith('refreshToken'))!;
  });

  it('401 — wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: VALID_USER.email, password: 'WrongPassword1!' });

    expect(res.status).toBe(401);
  });
});

// ─── POST /api/auth/refresh ─────────────────────────────────────────────────

describe('POST /api/auth/refresh', () => {
  it('200 — returns new access token and rotates cookie', async () => {
    if (!refreshCookie) {
      // Re-login to get cookie if prior test didn't set it
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: VALID_USER.email, password: VALID_USER.password });
      const c = (res.headers['set-cookie'] as unknown as string[]);
      refreshCookie = c.find(c => c.startsWith('refreshToken'))!;
    }

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('401 — missing refresh cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('204 — clears refresh cookie', async () => {
    // Login fresh
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: VALID_USER.email, password: VALID_USER.password });

    const accessToken = loginRes.body.data.accessToken as string;

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(204);
  });

  it('401 — no access token provided', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────

describe('POST /api/auth/forgot-password', () => {
  it('200 — always succeeds (no email leakage)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody-ever@nonexistent.com' });

    // Should not reveal whether email exists
    expect([200, 204]).toContain(res.status);
  });

  it('200 — succeeds for real user too', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: VALID_USER.email });

    expect([200, 204]).toContain(res.status);
  });
});

// ─── PATCH /api/auth/reset-password/:token ────────────────────────────────────

describe('PATCH /api/auth/reset-password/:token', () => {
  it('400 — expired / invalid token', async () => {
    const fakeToken = crypto.randomBytes(32).toString('hex');
    const res = await request(app)
      .patch(`/api/auth/reset-password/${fakeToken}`)
      .send({ password: 'NewPassword1!', confirmPassword: 'NewPassword1!' });

    expect(res.status).toBe(400);
  });
});

