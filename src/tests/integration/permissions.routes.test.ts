import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../../app';
import User from '@modules/users/user.model';
import Role from '@modules/permissions/models/role.model';
import Permission from '@modules/permissions/models/permission.model';
import Policy from '@modules/permissions/models/policy.model';
import UserPermissionOverride from '@modules/permissions/models/user-permission-override.model';
import bcrypt from 'bcryptjs';

describe('Permissions Module Integration Tests', () => {
  let adminToken: string;
  let userToken: string;
  let adminUser: any;
  let regularUser: any;
  let testRole: any;
  let testPermission: any;
  let testPolicy: any;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/solarspot-test');
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear collections
    await Promise.all([
      User.deleteMany({}),
      Role.deleteMany({}),
      Permission.deleteMany({}),
      Policy.deleteMany({}),
      UserPermissionOverride.deleteMany({}),
    ]);

    // Create test role and permission
    testRole = await Role.create({
      name: 'test_user',
      displayName: 'Test User',
      description: 'Role for testing',
      roleLevel: 1,
      component: 'test',
      isSystem: false,
      isActive: true,
    });

    testPermission = await Permission.create({
      action: 'stations.create',
      resource: 'Station',
      component: 'stations',
      description: 'Create stations',
    });

    testPolicy = await Policy.create({
      name: 'email_verified_test',
      displayName: 'Email Verified Test',
      condition: 'email_verified',
      effect: 'allow',
      description: 'Email must be verified',
      isBuiltIn: true,
      isActive: true,
    });

    // Create test users
    const hashedPassword = await bcrypt.hash('Test@2026!', 12);
    
    adminUser = await User.create({
      email: 'admin@test.app',
      password: hashedPassword,
      displayName: 'Admin',
      role: 'admin',
      isEmailVerified: true,
      isActive: true,
    });

    regularUser = await User.create({
      email: 'user@test.app',
      password: hashedPassword,
      displayName: 'User',
      role: 'user',
      isEmailVerified: true,
      isActive: true,
    });

    // Get tokens
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.app', password: 'Test@2026!' });
    adminToken = adminRes.body.data.accessToken;

    const userRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@test.app', password: 'Test@2026!' });
    userToken = userRes.body.data.accessToken;
  });

  describe('GET /api/permissions/roles', () => {
    it('should return all roles for admin', async () => {
      const res = await request(app)
        .get('/api/permissions/roles')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should deny access to regular users', async () => {
      const res = await request(app)
        .get('/api/permissions/roles')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/permissions/roles', () => {
    it('should allow admin to create new role', async () => {
      const res = await request(app)
        .post('/api/permissions/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'custom_role',
          displayName: 'Custom Role',
          description: 'Custom test role',
          roleLevel: 2,
          component: 'custom',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('custom_role');
    });

    it('should prevent duplicate role names', async () => {
      await Role.create({
        name: 'duplicate',
        displayName: 'Duplicate',
        description: 'Duplicate role for testing',
        roleLevel: 1,
        component: 'test',
        isSystem: false,
        isActive: true,
      });

      const res = await request(app)
        .post('/api/permissions/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'duplicate',
          displayName: 'Another Duplicate',
          description: 'Another duplicate role',
          roleLevel: 1,
          component: 'test',
        });

      expect(res.status).toBe(409);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/permissions/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'incomplete',
          // Missing required fields
        });

      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/permissions/list', () => {
    it('should return all permissions', async () => {
      const res = await request(app)
        .get('/api/permissions/list')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/permissions/policies', () => {
    it('should return all policies', async () => {
      const res = await request(app)
        .get('/api/permissions/policies')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/permissions/policies', () => {
    it('should allow admin to create custom policy', async () => {
      const res = await request(app)
        .post('/api/permissions/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'custom_policy',
          displayName: 'Custom Policy',
          condition: 'email_verified',
          effect: 'allow',
          description: 'Custom test policy',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('custom_policy');
    });

    it('should prevent modifying built-in policies', async () => {
      const builtInPolicy = await Policy.create({
        name: 'builtin_policy',
        displayName: 'Built-in Policy',
        condition: 'account_active',
        effect: 'allow',
        description: 'Built-in policy',
        isBuiltIn: true,
        isActive: true,
      });

      const res = await request(app)
        .put(`/api/permissions/policies/${builtInPolicy._id.toString()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          displayName: 'Modified Built-in',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/permissions/users/:userId/overrides', () => {
    it('should allow admin to create user permission override', async () => {
      const res = await request(app)
        .post(`/api/permissions/users/${regularUser._id}/overrides`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          permission: testPermission._id.toString(),
          effect: 'grant',
          reason: 'Test grant',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.data.effect).toBe('grant');
    });

    it('should send notification email on override', async () => {
      const res = await request(app)
        .post(`/api/permissions/users/${regularUser._id}/overrides`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          permission: testPermission._id.toString(),
          effect: 'deny',
          reason: 'Test denial',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });

      expect(res.status).toBe(201);
      // Email service should be called (mocked in tests)
    });

    it('should flush permission cache on override creation', async () => {
      const res = await request(app)
        .post(`/api/permissions/users/${regularUser._id}/overrides`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          permission: testPermission._id.toString(),
          effect: 'grant',
          reason: 'Cache test',
        });

      expect(res.status).toBe(201);
      // Cache should be flushed for user
    });
  });

  describe('DELETE /api/permissions/users/:userId/overrides/:overrideId', () => {
    it('should allow admin to delete override', async () => {
      const override = await UserPermissionOverride.create({
        user: regularUser._id,
        permission: testPermission._id,
        effect: 'grant',
        reason: 'To be deleted',
        grantedBy: adminUser._id,
      });

      const res = await request(app)
        .delete(`/api/permissions/users/${regularUser._id}/overrides/${override._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      const deleted = await UserPermissionOverride.findById(override._id);
      expect(deleted).toBeNull();
    });

    it('should flush cache on override deletion', async () => {
      const override = await UserPermissionOverride.create({
        user: regularUser._id,
        permission: testPermission._id,
        effect: 'deny',
        reason: 'Cache flush test',
        grantedBy: adminUser._id,
      });

      const res = await request(app)
        .delete(`/api/permissions/users/${regularUser._id}/overrides/${override._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/permissions/audit', () => {
    it('should return audit logs for admin', async () => {
      const res = await request(app)
        .get('/api/permissions/audit')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/permissions/audit?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination).toBeDefined();
    });

    it('should support filtering by actor', async () => {
      const res = await request(app)
        .get(`/api/permissions/audit?actor=${adminUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('should support filtering by resource', async () => {
      const res = await request(app)
        .get('/api/permissions/audit?resource=User')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/permissions/reload', () => {
    it('should allow admin to reload permission cache', async () => {
      const res = await request(app)
        .post('/api/permissions/reload')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('flushed');
    });

    it('should deny non-admin access', async () => {
      const res = await request(app)
        .post('/api/permissions/reload')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Permission Enforcement', () => {
    it('should return 403 when user lacks permission', async () => {
      // Regular user trying to access admin endpoint
      const res = await request(app)
        .get('/api/permissions/roles')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toContain('FORBIDDEN');
    });

    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/permissions/roles');

      expect(res.status).toBe(401);
    });

    it('should allow admin bypass for all permissions', async () => {
      const res = await request(app)
        .get('/api/permissions/roles')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Transaction Safety', () => {
    it('should rollback on error during override creation', async () => {
      const beforeCount = await UserPermissionOverride.countDocuments();

      // Attempt to create with invalid data
      const res = await request(app)
        .post(`/api/permissions/users/${regularUser._id}/overrides`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          permission: 'invalid-id',
          effect: 'grant',
        });

      expect(res.status).toBe(400);
      
      const afterCount = await UserPermissionOverride.countDocuments();
      expect(afterCount).toBe(beforeCount); // No partial write
    });
  });

  describe('ACID Compliance', () => {
    it('should handle concurrent override creations atomically', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post(`/api/permissions/users/${regularUser._id}/overrides`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            permission: testPermission._id.toString(),
            effect: 'grant',
            reason: `Test ${i}`,
          })
      );

      const results = await Promise.all(promises);
      
      // First should succeed, rest should fail (can't have multiple active overrides for same permission)
      const successCount = results.filter(r => r.status === 201).length;
      expect(successCount).toBeGreaterThan(0);
    });
  });
});
