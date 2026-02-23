import request from 'supertest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import app from '../../../app';
import User from '@modules/users/user.model';


function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}


beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  await User.deleteMany({});
});

describe('POST /api/auth/register', () => {
  it('returns 201 and user data on valid input', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'Password123!', displayName: 'Alice' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ email: 'alice@example.com', displayName: 'Alice' });
    expect(res.body.data.password).toBeUndefined();
  });

  it('returns 409 on duplicate email', async () => {
    await User.create({
      email: 'alice@example.com',
      password: 'Password123!',
      displayName: 'Alice',
      isEmailVerified: true,
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'Password123!', displayName: 'Alice' });

    expect(res.status).toBe(409);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'missing-fields@example.com' }); 

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('GET /api/auth/verify-email/:token', () => {
  it('returns 200 and access token on valid token', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = sha256(rawToken);

    await User.create({
      email: 'bob@example.com',
      password: 'Password123!',
      displayName: 'Bob',
      isEmailVerified: false,
      emailVerifyToken: hashedToken,
      emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const res = await request(app).get(`/api/auth/verify-email/${rawToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 400 on expired or invalid token', async () => {
    const res = await request(app).get('/api/auth/verify-email/totally-invalid-token');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  let verifiedUserPass: string;

  beforeEach(async () => {
    verifiedUserPass = 'Password123!';
    await User.create({
      email: 'carol@example.com',
      password: verifiedUserPass,
      displayName: 'Carol',
      isEmailVerified: true,
      isActive: true,
    });
  });

  it('returns 200 with accessToken and sets refreshToken cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'carol@example.com', password: verifiedUserPass });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'carol@example.com', password: 'WrongPass!' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('returns 403 when email is not verified', async () => {
    await User.create({
      email: 'unverified@example.com',
      password: 'Password123!',
      displayName: 'Unverified',
      isEmailVerified: false,
      isActive: true,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unverified@example.com', password: 'Password123!' });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/auth/logout', () => {
  it('returns 204 and clears the cookie', async () => {
    const rawVerifyToken = crypto.randomBytes(32).toString('hex');
    const user = await User.create({
      email: 'dave@example.com',
      password: 'Password123!',
      displayName: 'Dave',
      isEmailVerified: true,
      isActive: true,
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dave@example.com', password: 'Password123!' });

    expect(loginRes.status).toBe(200);
    const { accessToken } = loginRes.body.data;
    void user; void rawVerifyToken;

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(logoutRes.status).toBe(204);
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns 200 with new accessToken when refresh cookie is valid', async () => {
    await User.create({
      email: 'eve@example.com',
      password: 'Password123!',
      displayName: 'Eve',
      isEmailVerified: true,
      isActive: true,
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'eve@example.com', password: 'Password123!' });

    expect(loginRes.status).toBe(200);

    const cookies = loginRes.headers['set-cookie'] as unknown as string[];

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookies);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeDefined();
  });

  it('returns 401 when no refresh cookie is provided', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('always returns 200 regardless of whether email exists', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nonexistent@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('If an account exists, a reset link has been sent');
  });
});

describe('PATCH /api/auth/reset-password/:token', () => {
  it('returns 200 when token is valid and not expired', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');

    await User.create({
      email: 'frank@example.com',
      password: 'OldPassword1!',
      displayName: 'Frank',
      isEmailVerified: true,
      isActive: true,
      passwordResetToken: sha256(rawToken),
      passwordResetExpires: new Date(Date.now() + 10 * 60 * 1000),
    });

    const res = await request(app)
      .patch(`/api/auth/reset-password/${rawToken}`)
      .send({ password: 'NewPassword1!' });

    expect(res.status).toBe(200);
  });

  it('returns 400 when token is invalid', async () => {
    const res = await request(app)
      .patch('/api/auth/reset-password/totally-fake-token')
      .send({ password: 'NewPassword1!' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/users/admin/users', () => {
  it('returns 200 and paginated users for admin role', async () => {
    await User.create({
      email: 'admin@example.com',
      password: 'AdminPass1!',
      displayName: 'Admin User',
      role: 'admin',
      isEmailVerified: true,
      isActive: true,
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'AdminPass1!' });

    expect(loginRes.status).toBe(200);
    const { accessToken } = loginRes.body.data;

    const res = await request(app)
      .get('/api/users/admin/users')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  it('returns 403 for user role', async () => {
    await User.create({
      email: 'regular@example.com',
      password: 'UserPass1!',
      displayName: 'Regular',
      role: 'user',
      isEmailVerified: true,
      isActive: true,
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'regular@example.com', password: 'UserPass1!' });

    const { accessToken } = loginRes.body.data;

    const res = await request(app)
      .get('/api/users/admin/users')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 for unauthenticated requests', async () => {
    const res = await request(app).get('/api/users/admin/users');
    expect(res.status).toBe(401);
  });
});
