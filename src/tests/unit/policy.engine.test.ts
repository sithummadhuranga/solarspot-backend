import mongoose from 'mongoose';
import { PolicyEngine } from '@services/policy.engine';
import Policy from '@modules/permissions/models/policy.model';
import Role from '@modules/permissions/models/role.model';

describe('PolicyEngine', () => {
  let engine: PolicyEngine;
  let mockUser: any;
  let mockRole: any;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/solarspot-test');
    engine = new PolicyEngine();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Promise.all([
      Policy.deleteMany({}),
      Role.deleteMany({}),
    ]);

    mockRole = await Role.create({
      name: 'test_user',
      displayName: 'Test User',
      description: 'Test user role',
      roleLevel: 1,
      component: 'test',
      isSystem: false,
      isActive: true,
    });

    mockUser = {
      _id: new mongoose.Types.ObjectId(),
      email: 'verified@example.com',
      displayName: 'Test User',
      role: mockRole,
      isActive: true,
      isEmailVerified: true,
    };
  });

  describe('email_verified condition', () => {
    it('should return true if user email is verified', async () => {
      const policy = await Policy.create({
        name: 'email_verified_policy',
        displayName: 'Email Verified',
        condition: 'email_verified',
        effect: 'allow',
        description: 'Require verified email',
        isBuiltIn: true,
        isActive: true,
      });

      const result = await engine.evaluate(policy, mockUser);
      expect(result).toBe(true);
    });

    it('should return false if user email is not verified', async () => {
      const unverifiedUser = { ...mockUser, isEmailVerified: false };
      const policy = await Policy.create({
        name: 'email_verified_policy',
        displayName: 'Email Verified',
        condition: 'email_verified',
        effect: 'allow',
        description: 'Require verified email',
        isBuiltIn: true,
        isActive: true,
      });

      const result = await engine.evaluate(policy, unverifiedUser);
      expect(result).toBe(false);
    });
  });

  describe('account_active condition', () => {
    it('should return true if user account is active', async () => {
      const policy = await Policy.create({
        name: 'account_active_policy',
        displayName: 'Active Account',
        condition: 'account_active',
        effect: 'allow',
        description: 'Require active account',
        isBuiltIn: true,
        isActive: true,
      });

      const result = await engine.evaluate(policy, mockUser);
      expect(result).toBe(true);
    });

    it('should return false if user account is inactive', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      const policy = await Policy.create({
        name: 'account_active_policy',
        displayName: 'Active Account',
        condition: 'account_active',
        effect: 'allow',
        description: 'Require active account',
        isBuiltIn: true,
        isActive: true,
      });

      const result = await engine.evaluate(policy, inactiveUser);
      expect(result).toBe(false);
    });
  });

  describe('owner_match condition', () => {
    it('should return true if user owns the resource', async () => {
      const policy = await Policy.create({
        name: 'Owner Match',
        displayName: 'Owner Match',
        condition: 'owner_match',
        effect: 'allow',
        description: 'User must be owner',
        config: { ownerField: 'submittedBy' },
        isBuiltIn: true,
        isActive: true,
      });

      const resource = {
        _id: new mongoose.Types.ObjectId(),
        submittedBy: mockUser._id,
      };

      const result = await engine.evaluate(policy, mockUser, resource as any);
      expect(result).toBe(true);
    });

    it('should return false if user is not the owner', async () => {
      const policy = await Policy.create({
        name: 'Owner Match',
        displayName: 'Owner Match',
        condition: 'owner_match',
        effect: 'allow',
        description: 'User must be owner',
        config: { ownerField: 'submittedBy' },
        isBuiltIn: true,
        isActive: true,
      });

      const resource = {
        _id: new mongoose.Types.ObjectId(),
        submittedBy: new mongoose.Types.ObjectId(),
      };

      const result = await engine.evaluate(policy, mockUser, resource as any);
      expect(result).toBe(false);
    });

    it('should return false if no resource provided', async () => {
      const policy = await Policy.create({
        name: 'Owner Match',
        displayName: 'Owner Match',
        condition: 'owner_match',
        effect: 'allow',
        description: 'User must be owner',
        config: { ownerField: 'submittedBy' },
        isBuiltIn: true,
        isActive: true,
      });

      const result = await engine.evaluate(policy, mockUser);
      expect(result).toBe(false);
    });
  });

  describe('role_minimum condition', () => {
    it('should return true if user role level meets minimum', async () => {
      const policy = await Policy.create({
        name: 'Role Minimum',
        displayName: 'Role Minimum',
        condition: 'role_minimum',
        effect: 'allow',
        description: 'Minimum role level required',
        config: { minLevel: 1 },
        isBuiltIn: true,
        isActive: true,
      });

      const result = await engine.evaluate(policy, mockUser);
      expect(result).toBe(true);
    });

    it('should return false if user role level below minimum', async () => {
      const policy = await Policy.create({
        name: 'Role Minimum',
        displayName: 'Role Minimum',
        condition: 'role_minimum',
        effect: 'allow',
        description: 'Minimum role level required',
        config: { minLevel: 3 },
        isBuiltIn: true,
        isActive: true,
      });

      const result = await engine.evaluate(policy, mockUser);
      expect(result).toBe(false);
    });
  });

  describe('field_equals condition', () => {
    it('should return true if field value matches', async () => {
      const policy = await Policy.create({
        name: 'Field Equals',
        displayName: 'Field Equals',
        condition: 'field_equals',
        effect: 'allow',
        description: 'Field must equal value',
        config: { field: 'status', value: 'approved' },
        isBuiltIn: true,
        isActive: true,
      });

      const resource = {
        _id: new mongoose.Types.ObjectId(),
        status: 'approved',
      };

      const result = await engine.evaluate(policy, mockUser, resource as any);
      expect(result).toBe(true);
    });

    it('should return false if field value does not match', async () => {
      const policy = await Policy.create({
        name: 'Field Equals',
        displayName: 'Field Equals',
        condition: 'field_equals',
        effect: 'allow',
        description: 'Field must equal value',
        config: { field: 'status', value: 'approved' },
        isBuiltIn: true,
        isActive: true,
      });

      const resource = {
        _id: new mongoose.Types.ObjectId(),
        status: 'pending',
      };

      const result = await engine.evaluate(policy, mockUser, resource as any);
      expect(result).toBe(false);
    });
  });

  describe('time_window condition', () => {
    it('should return true if within time window', async () => {
      const policy = await Policy.create({
        name: 'Time Window',
        displayName: 'Time Window',
        condition: 'time_window',
        effect: 'allow',
        description: 'Must be within time window',
        config: { hours: 48 },
        isBuiltIn: true,
        isActive: true,
      });

      const resource = {
        _id: new mongoose.Types.ObjectId(),
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      };

      const result = await engine.evaluate(policy, mockUser, resource as any);
      expect(result).toBe(true);
    });

    it('should return false if outside time window', async () => {
      const policy = await Policy.create({
        name: 'Time Window',
        displayName: 'Time Window',
        condition: 'time_window',
        effect: 'allow',
        description: 'Must be within time window',
        config: { hours: 48 },
        isBuiltIn: true,
        isActive: true,
      });

      const resource = {
        _id: new mongoose.Types.ObjectId(),
        createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000), // 72 hours ago
      };

      const result = await engine.evaluate(policy, mockUser, resource as any);
      expect(result).toBe(false);
    });
  });

  describe('no_self_vote condition', () => {
    it('should return true if user is not voting on own content', async () => {
      const policy = await Policy.create({
        name: 'No Self Vote',
        displayName: 'No Self Vote',
        condition: 'no_self_vote',
        effect: 'allow',
        description: 'Cannot vote on own content',
        config: { ownerField: 'author' },
        isBuiltIn: true,
        isActive: true,
      });

      const resource = {
        _id: new mongoose.Types.ObjectId(),
        author: new mongoose.Types.ObjectId(),
      };

      const result = await engine.evaluate(policy, mockUser, resource as any);
      expect(result).toBe(true);
    });

    it('should return false if user is voting on own content', async () => {
      const policy = await Policy.create({
        name: 'No Self Vote',
        displayName: 'No Self Vote',
        condition: 'no_self_vote',
        effect: 'allow',
        description: 'Cannot vote on own content',
        config: { ownerField: 'author' },
        isBuiltIn: true,
        isActive: true,
      });

      const resource = {
        _id: new mongoose.Types.ObjectId(),
        author: mockUser._id,
      };

      const result = await engine.evaluate(policy, mockUser, resource as any);
      expect(result).toBe(false);
    });
  });

  describe('ownership_check condition', () => {
    it('should return true if mustNotMatch is true and user is not owner', async () => {
      const policy = await Policy.create({
        name: 'Ownership Check',
        displayName: 'Ownership Check',
        condition: 'ownership_check',
        effect: 'allow',
        description: 'Check ownership',
        config: { mustNotMatch: true, ownerField: 'submittedBy' },
        isBuiltIn: true,
        isActive: true,
      });

      const resource = {
        _id: new mongoose.Types.ObjectId(),
        submittedBy: new mongoose.Types.ObjectId(),
      };

      const result = await engine.evaluate(policy, mockUser, resource as any);
      expect(result).toBe(true);
    });

    it('should return false if mustNotMatch is true and user is owner', async () => {
      const policy = await Policy.create({
        name: 'Ownership Check',
        displayName: 'Ownership Check',
        condition: 'ownership_check',
        effect: 'allow',
        description: 'Check ownership',
        config: { mustNotMatch: true, ownerField: 'submittedBy' },
        isBuiltIn: true,
        isActive: true,
      });

      const resource = {
        _id: new mongoose.Types.ObjectId(),
        submittedBy: mockUser._id,
      };

      const result = await engine.evaluate(policy, mockUser, resource as any);
      expect(result).toBe(false);
    });
  });

  describe('unique_review condition', () => {
    it('should return true if Review model does not exist', async () => {
      const policy = await Policy.create({
        name: 'Unique Review',
        displayName: 'Unique Review',
        condition: 'unique_review',
        effect: 'allow',
        description: 'One review per station',
        isBuiltIn: true,
        isActive: true,
      });

      const resource = {
        _id: new mongoose.Types.ObjectId(),
      };

      const result = await engine.evaluate(policy, mockUser, resource as any);
      expect(result).toBe(true); // Graceful fallback when Review model not loaded
    });
  });

  describe('Edge Cases', () => {
    it('should throw error for unknown condition', async () => {
      const policy = await Policy.create({
        name: 'Unknown',
        displayName: 'Unknown',
        condition: 'unknown_condition' as any,
        effect: 'allow',
        description: 'Unknown',
        isBuiltIn: true,
        isActive: true,
      });

      await expect(engine.evaluate(policy, mockUser)).rejects.toThrow();
    });

    it('should handle missing config gracefully', async () => {
      const policy = await Policy.create({
        name: 'Owner Match',
        displayName: 'Owner Match',
        condition: 'owner_match',
        effect: 'allow',
        description: 'User must be owner',
        // No config provided
        isBuiltIn: true,
        isActive: true,
      });

      const resource = {
        _id: new mongoose.Types.ObjectId(),
        submittedBy: mockUser._id,
      };

      const result = await engine.evaluate(policy, mockUser, resource as any);
      expect(typeof result).toBe('boolean');
    });

    it('should handle multiple policy evaluations concurrently', async () => {
      const policies = await Promise.all([
        Policy.create({
          name: 'Email Verified',
          displayName: 'Email Verified',
          condition: 'email_verified',
          effect: 'allow',
          description: 'Require verified email',
          isBuiltIn: true,
          isActive: true,
        }),
        Policy.create({
          name: 'Active Account',
          displayName: 'Active Account',
          condition: 'account_active',
          effect: 'allow',
          description: 'Require active account',
          isBuiltIn: true,
          isActive: true,
        }),
      ]);

      const promises = policies.map(p => engine.evaluate(p, mockUser));
      const results = await Promise.all(promises);

      expect(results.every(r => r === true)).toBe(true);
    });
  });
});
