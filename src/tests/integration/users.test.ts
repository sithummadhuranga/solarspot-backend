/**
 * Integration tests — Users endpoints
 * Ref: MASTER_PROMPT.md → Testing → Integration tests hit actual Express router + in-memory DB
 */

import request  from 'supertest';
import mongoose from 'mongoose';
import app      from '../../../app';
import { connectTestDb, disconnectTestDb, seedCore } from './helpers';
import { User }  from '@modules/users/user.model';
import { Role }  from '@modules/permissions/role.model';

let userToken: string;
let adminToken: string;
let adminUserId: string;
let regularUserId: string;

const REG_USER = { displayName: 'Regular User', email: `reg-${Date.now()}@test.com`, password: 'Regular1!' };
const ADM_USER = { displayName: 'Admin User',   email: `adm-${Date.now()}@test.com`, password: 'Admin123!' };

/** Register + force-verify email + login → return access token */
async function registerAndLogin(payload: typeof REG_USER): Promise<{ token: string; userId: string }> {
  await request(app).post('/api/auth/register').send(payload);
  const user = await User.findOneAndUpdate(
    { email: payload.email },
    { isEmailVerified: true, $unset: { emailVerifyToken: 1, emailVerifyExpires: 1 } },
    { new: true },
  );
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: payload.email, password: payload.password });
  return { token: res.body.data.accessToken as string, userId: String(user!._id) };
}

beforeAll(async () => {
  await connectTestDb();
  await seedCore();

  // Create regular user
  const reg = await registerAndLogin(REG_USER);
  userToken   = reg.token;
  regularUserId = reg.userId;

  // Create admin user
  const adm = await registerAndLogin(ADM_USER);
  adminToken  = adm.token;
  adminUserId = adm.userId;

  // Promote admin to super_admin role
  const superAdminRole = await Role.findOne({ name: 'super_admin' }).lean();
  if (superAdminRole) {
    await User.findByIdAndUpdate(adminUserId, { role: superAdminRole._id });
    // Re-login to get a new token with updated role
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADM_USER.email, password: ADM_USER.password });
    adminToken = res.body.data.accessToken as string;
  }
});

afterAll(async () => {
  await disconnectTestDb();
});

// ─── GET /api/users/me ────────────────────────────────────────────────────────

describe('GET /api/users/me', () => {
  it('200 — returns own profile', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(REG_USER.email);
  });

  it('401 — unauthenticated', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });
});

// ─── PUT /api/users/me ────────────────────────────────────────────────────────

describe('PUT /api/users/me', () => {
  it('200 — updates own display name', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ displayName: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('Updated Name');
  });

  it('422 — empty displayName rejected', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ displayName: '' });

    expect(res.status).toBe(422);
  });
});

// ─── GET /api/users/:id ───────────────────────────────────────────────────────

describe('GET /api/users/:id', () => {
  it('200 — returns user profile', async () => {
    const res = await request(app)
      .get(`/api/users/${regularUserId}`);

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(regularUserId);
  });

  it('404 — non-existent user', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/users/${fakeId}`);
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/users (list) ────────────────────────────────────────────────────

describe('GET /api/users', () => {
  it('200 — admin can list users', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.data).toBeDefined();
    expect(typeof res.body.data.total).toBe('number');
  });

  it('403 — regular user cannot list all users', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${userToken}`);

    expect([401, 403]).toContain(res.status);
  });
});

// ─── PUT /api/users/:id ───────────────────────────────────────────────────────

describe('PUT /api/users/:id (admin)', () => {
  it('200 — admin can ban a user', async () => {
    const res = await request(app)
      .put(`/api/users/${regularUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isBanned: true });

    expect(res.status).toBe(200);
    expect(res.body.data.isBanned).toBe(true);
  });

  it('403 — regular user cannot admin-update another user', async () => {
    const res = await request(app)
      .put(`/api/users/${adminUserId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ isBanned: true });

    expect([401, 403]).toContain(res.status);
  });
});

// ─── DELETE /api/users/me ─────────────────────────────────────────────────────

describe('DELETE /api/users/me', () => {
  it('204 — soft-deletes own account', async () => {
    // Create a throwaway user
    const throwaway = { displayName: 'Throwaway', email: `throw-${Date.now()}@test.example`, password: 'Delete1!' };
    const { token } = await registerAndLogin(throwaway);

    const res = await request(app)
      .delete('/api/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });
});
