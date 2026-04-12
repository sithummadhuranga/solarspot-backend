

import request  from 'supertest';
import crypto   from 'crypto';
import app      from '../../../app';
import { connectTestDb, disconnectTestDb, seedCore } from './helpers';
import { User }                                                    from '@modules/users/user.model';

let refreshCookie: string;
let _verifyToken: string; // captured for future email-verification flow tests

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
});


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


describe('POST /api/auth/login — email not verified', () => {
  it('401 — user registered but email not yet verified', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: VALID_USER.email, password: VALID_USER.password });

    expect(res.status).toBe(401);
  });
});


describe('GET /api/auth/verify-email/:token', () => {
  beforeAll(async () => {
    const user = await User.findOne({ email: VALID_USER.email }).select('+emailVerifyToken').lean();
    _verifyToken = (user as unknown as Record<string, unknown>)?.emailVerifyTokenRaw as string ?? 'invalid-token';
  });

  it('400 — invalid / expired token', async () => {
    const res = await request(app).get('/api/auth/verify-email/garbage-token-xyz123');
    expect(res.status).toBe(400);
  });
});


describe('POST /api/auth/login — verified user', () => {
  let _accessToken: string;

  beforeAll(async () => {
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

    _accessToken = res.body.data.accessToken;
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


describe('POST /api/auth/refresh', () => {
  it('200 — returns new access token and rotates cookie', async () => {
    if (!refreshCookie) {
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


describe('POST /api/auth/logout', () => {
  it('204 — clears refresh cookie', async () => {
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


describe('POST /api/auth/forgot-password', () => {
  it('200 — always succeeds (no email leakage)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody-ever@nonexistent.com' });

    expect([200, 204]).toContain(res.status);
  });

  it('200 — succeeds for real user too', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: VALID_USER.email });

    expect([200, 204]).toContain(res.status);
  });
});


describe('PATCH /api/auth/reset-password/:token', () => {
  it('400 — expired / invalid token', async () => {
    const fakeToken = crypto.randomBytes(32).toString('hex');
    const res = await request(app)
      .patch(`/api/auth/reset-password/${fakeToken}`)
      .send({ password: 'NewPassword1!', confirmPassword: 'NewPassword1!' });

    expect(res.status).toBe(400);
  });
});

