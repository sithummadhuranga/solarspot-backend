import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../../app';
import User from '@modules/users/user.model';
import bcrypt from 'bcryptjs';

describe('Users Module Integration Tests', () => {
  let adminToken: string;
  let userToken: string;
  let adminUser: any;
  let regularUser: any;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/solarspot-test');
    
    // Seed core data (roles, permissions, etc.) - simplified for testing
    // In real scenario, run seed:core script
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await User.deleteMany({});

    // Create admin user
    const hashedPassword = await bcrypt.hash('Admin@2026!', 12);
    adminUser = await User.create({
      email: 'admin@solarspot.app',
      password: hashedPassword,
      displayName: 'Admin User',
      role: 'admin',
      isEmailVerified: true,
      isActive: true,
    });

    // Create regular user
    regularUser = await User.create({
      email: 'user@solarspot.app',
      password: hashedPassword,
      displayName: 'Regular User',
      role: 'user',
      isEmailVerified: true,
      isActive: true,
    });

    // Login to get tokens
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@solarspot.app', password: 'Admin@2026!' });
    adminToken = adminRes.body.data.accessToken;

    const userRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@solarspot.app', password: 'Admin@2026!' });
    userToken = userRes.body.data.accessToken;
  });

  describe('GET /api/users/me', () => {
    it('should return authenticated user profile', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('user@solarspot.app');
      expect(res.body.data.displayName).toBe('Regular User');
      expect(res.body.data).not.toHaveProperty('password');
      expect(res.body.data).not.toHaveProperty('refreshToken');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/users/me');

      expect(res.status).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/users/me', () => {
    it('should update own profile successfully', async () => {
      const res = await request(app)
        .put('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          displayName: 'Updated Name',
          bio: 'New bio text',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.displayName).toBe('Updated Name');
      expect(res.body.data.bio).toBe('New bio text');
    });

    it('should reject invalid updates (unknown fields)', async () => {
      const res = await request(app)
        .put('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          displayName: 'Valid',
          invalidField: 'Should be stripped',
        });

      expect(res.status).toBe(200); // Joi stripUnknown should handle this
      expect(res.body.data).not.toHaveProperty('invalidField');
    });

    it('should reject updates with validation errors', async () => {
      const res = await request(app)
        .put('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          displayName: 'X', // Too short
        });

      expect(res.status).toBe(422);
    });

    it('should not allow updating email or role', async () => {
      const res = await request(app)
        .put('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          email: 'hacker@example.com',
          role: 'admin',
        });

      // Fields should be stripped by Joi schema
      const user = await User.findById(regularUser._id);
      expect(user?.email).toBe('user@solarspot.app');
      expect(user?.role).toBe('user');
    });
  });

  describe('DELETE /api/users/me', () => {
    it('should allow user to self-delete account', async () => {
      const res = await request(app)
        .delete('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const deletedUser = await User.findById(regularUser._id);
      expect(deletedUser?.isActive).toBe(false);
      expect(deletedUser?.email).toContain('deleted_');
    });

    it('should invalidate refresh token on deletion', async () => {
      await request(app)
        .delete('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`);

      const deletedUser = await User.findById(regularUser._id).select('+refreshToken');
      expect(deletedUser?.refreshToken).toBeNull();
    });
  });

  describe('GET /api/users/:id/public', () => {
    it('should return public profile without auth', async () => {
      const res = await request(app)
        .get(`/api/users/${regularUser._id}/public`);

      expect(res.status).toBe(200);
      expect(res.body.data.displayName).toBe('Regular User');
      expect(res.body.data).not.toHaveProperty('email');
      expect(res.body.data).not.toHaveProperty('password');
    });

    it('should return 404 for inactive user', async () => {
      await User.findByIdAndUpdate(regularUser._id, { isActive: false });

      const res = await request(app)
        .get(`/api/users/${regularUser._id}/public`);

      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/users/${fakeId}/public`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/users/admin/users (Admin Only)', () => {
    it('should return paginated user list for admin', async () => {
      const res = await request(app)
        .get('/api/users/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it('should deny access to regular users', async () => {
      const res = await request(app)
        .get('/api/users/admin/users')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it('should support filtering by role', async () => {
      const res = await request(app)
        .get('/api/users/admin/users?role=admin')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((u: any) => u.role === 'admin')).toBe(true);
    });

    it('should support search by email or displayName', async () => {
      const res = await request(app)
        .get('/api/users/admin/users?search=Regular')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/users/admin/users?page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(1);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(1);
    });
  });

  describe('PATCH /api/users/admin/users/:id/role (Admin Only)', () => {
    it('should allow admin to change user role', async () => {
      const res = await request(app)
        .patch(`/api/users/admin/users/${regularUser._id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'moderator' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('moderator');
    });

    it('should deny non-admin from changing roles', async () => {
      const res = await request(app)
        .patch(`/api/users/admin/users/${adminUser._id}/role`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ role: 'admin' });

      expect(res.status).toBe(403);
    });

    it('should prevent admin from changing own role', async () => {
      const res = await request(app)
        .patch(`/api/users/admin/users/${adminUser._id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'user' });

      expect(res.status).toBe(400);
    });

    it('should prevent demoting last admin', async () => {
      // Only one admin exists
      const res = await request(app)
        .patch(`/api/users/admin/users/${adminUser._id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'user' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid role values', async () => {
      const res = await request(app)
        .patch(`/api/users/admin/users/${regularUser._id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'super_admin' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/users/admin/users/:id (Admin Only)', () => {
    it('should allow admin to delete user account', async () => {
      const res = await request(app)
        .delete(`/api/users/admin/users/${regularUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      const deletedUser = await User.findById(regularUser._id);
      expect(deletedUser?.isActive).toBe(false);
      expect(deletedUser?.email).toContain('deleted_');
    });

    it('should prevent admin from deleting own account', async () => {
      const res = await request(app)
        .delete(`/api/users/admin/users/${adminUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('should deny non-admin from deleting users', async () => {
      const res = await request(app)
        .delete(`/api/users/admin/users/${adminUser._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/users/admin/analytics (Admin Only)', () => {
    it('should return platform analytics for admin', async () => {
      const res = await request(app)
        .get('/api/users/admin/analytics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('totalUsers');
      expect(res.body.data).toHaveProperty('newUsersThisMonth');
      expect(res.body.data).toHaveProperty('totalStations');
      expect(res.body.data).toHaveProperty('totalReviews');
    });

    it('should deny access to regular users', async () => {
      const res = await request(app)
        .get('/api/users/admin/analytics')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it('should handle missing Station/Review models gracefully', async () => {
      const res = await request(app)
        .get('/api/users/admin/analytics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalStations).toBe(0);
      expect(res.body.data.totalReviews).toBe(0);
    });
  });
});
