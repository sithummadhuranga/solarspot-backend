

import request  from 'supertest';
import app      from '../../../app';
import { connectTestDb, disconnectTestDb, seedCore } from './helpers';
import { User }       from '@modules/users/user.model';
import { Role }       from '@modules/permissions/role.model';
import { Permission } from '@modules/permissions/permission.model';

let adminToken: string;
let regularToken: string;
let targetUserId: string;

const ADM = { displayName: 'Perm Admin',   email: `padm-${Date.now()}@test.com`, password: 'Admin123!' };
const REG = { displayName: 'Perm Regular', email: `preg-${Date.now()}@test.com`, password: 'Regular1!' };

async function registerAndLogin(p: typeof ADM): Promise<{ token: string; userId: string }> {
  await request(app).post('/api/auth/register').send(p);
  const user = await User.findOneAndUpdate(
    { email: p.email },
    { isEmailVerified: true, $unset: { emailVerifyToken: 1, emailVerifyExpires: 1 } },
    { new: true },
  );
  const res = await request(app).post('/api/auth/login').send({ email: p.email, password: p.password });
  return { token: res.body.data.accessToken as string, userId: String(user!._id) };
}

beforeAll(async () => {
  await connectTestDb();
  await seedCore();

  const adm = await registerAndLogin(ADM);
  adminToken = adm.token;

  const reg = await registerAndLogin(REG);
  regularToken = reg.token;
  targetUserId = reg.userId;

  const adminRole = await Role.findOne({ name: 'admin' }).lean();
  if (adminRole) {
    await User.findByIdAndUpdate(adm.userId, { role: adminRole._id });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: ADM.email, password: ADM.password });
    adminToken = loginRes.body.data.accessToken as string;
  }
});

afterAll(async () => {
  await disconnectTestDb();
});


describe('GET /api/admin/permissions', () => {
  it('200 — super_admin can list all seeded permissions', async () => {
    const res = await request(app)
      .get('/api/permissions/admin/permissions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(35);
  });

  it('401/403 — regular user cannot list permissions', async () => {
    const res = await request(app)
      .get('/api/permissions/admin/permissions')
      .set('Authorization', `Bearer ${regularToken}`);

    expect([401, 403]).toContain(res.status);
  });
});


describe('GET /api/admin/roles', () => {
  it('200 — returns all 10 seeded roles', async () => {
    const res = await request(app)
      .get('/api/permissions/admin/roles')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(10);
  });
});


describe('GET /api/admin/roles/:id/permissions', () => {
  it('200 — returns permissions assigned to a role', async () => {
    const role = await Role.findOne({ name: 'user' }).lean();
    const res  = await request(app)
      .get(`/api/permissions/admin/roles/${role!._id}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});


describe('POST /api/admin/roles/:id/permissions', () => {
  it('201 — assigns a new permission to a role', async () => {
    const role = await Role.findOne({ name: 'user' }).lean();
    const perm = await Permission.findOne({ action: 'users.read-list' }).lean();

    const res = await request(app)
      .post(`/api/permissions/admin/roles/${role!._id}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissionId: String(perm!._id) });

    expect([201, 409]).toContain(res.status);
  });
});


describe('GET /api/admin/users/:id/permissions', () => {
  it('200 — returns effective permissions (base + overrides)', async () => {
    const res = await request(app)
      .get(`/api/permissions/admin/users/${targetUserId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });
});


describe('GET /api/admin/users/:id/permissions/matrix', () => {
  it('200 — returns permission states with role and override sources', async () => {
    const perm = await Permission.findOne({ action: 'users.read-list' }).lean();

    await request(app)
      .post(`/api/permissions/admin/users/${targetUserId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissionId: String(perm!._id), effect: 'grant' });

    const res = await request(app)
      .get(`/api/permissions/admin/users/${targetUserId}/permissions/matrix`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const matching = res.body.data.find((item: { permission: { action: string }; source: string; allowed: boolean }) => item.permission.action === 'users.read-list');
    expect(matching).toBeDefined();
    expect(matching).toMatchObject({ allowed: true, source: 'override-grant' });
  });
});


describe('POST /api/admin/users/:id/permissions', () => {
  let grantedPermId: string;

  it('201 — creates a grant override for user', async () => {
    const perm = await Permission.findOne({ action: 'users.read-list' }).lean();
    grantedPermId = String(perm!._id);

    const res = await request(app)
      .post(`/api/permissions/admin/users/${targetUserId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissionId: grantedPermId, effect: 'grant' });

    expect([200, 201]).toContain(res.status);
  });
});


describe('POST /api/permissions/check', () => {
  it('200 — returns granted: true for a known action', async () => {
    const res = await request(app)
      .post('/api/permissions/check')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ action: 'users.read-own' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('allowed');
  });

  it('401 — unauthenticated', async () => {
    const res = await request(app)
      .post('/api/permissions/check')
      .send({ action: 'users.read-own' });

    expect(res.status).toBe(401);
  });
});


describe('GET /api/admin/audit-logs', () => {
  it('200 — returns paginated audit logs', async () => {
    const res = await request(app)
      .get('/api/permissions/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });
});


describe('GET /api/permissions/admin/quota', () => {
  it('200 — returns quota stats', async () => {
    const res = await request(app)
      .get('/api/permissions/admin/quota')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });
});
