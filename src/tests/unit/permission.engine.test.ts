import mongoose from 'mongoose';
import permissionEngine from '@services/permission.engine';
import Role from '@modules/permissions/models/role.model';
import Permission from '@modules/permissions/models/permission.model';
import Policy from '@modules/permissions/models/policy.model';
import RolePermission from '@modules/permissions/models/role-permission.model';
import UserPermissionOverride from '@modules/permissions/models/user-permission-override.model';

// Mock PolicyEngine
jest.mock('@services/policy.engine', () => ({
  __esModule: true,
  default: {
    evaluate: jest.fn().mockResolvedValue(true),
  },
}));

describe('PermissionEngine', () => {
  let mockUser: any;
  let mockRole: any;
  let mockPermission: any;

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
      Role.deleteMany({}),
      Permission.deleteMany({}),
      Policy.deleteMany({}),
      RolePermission.deleteMany({}),
      UserPermissionOverride.deleteMany({}),
    ]);

    // Create test role
    mockRole = await Role.create({
      name: 'test_user',
      displayName: 'Test User',
      description: 'Test user role',
      roleLevel: 1,
      component: 'test',
      isSystem: false,
      isActive: true,
    });

    // Create test permission
    mockPermission = await Permission.create({
      action: 'stations.create',
      resource: 'Station',
      component: 'stations',
      description: 'Create stations',
    });

    // Create test user
    mockUser = {
      _id: new mongoose.Types.ObjectId(),
      email: 'test@example.com',
      displayName: 'Test User',
      role: mockRole,
      isActive: true,
      isEmailVerified: true,
    };
  });

  describe('Step 1: Check Cache', () => {
    it('should return cached result if available', async () => {
      const result1 = await permissionEngine.evaluate(mockUser, 'stations.create');
      const result2 = await permissionEngine.evaluate(mockUser, 'stations.create');
      
      expect(result1.allowed).toBe(result2.allowed);
      expect(result2.reason).toContain('cached');
    });

    it('should skip cache for admin users', async () => {
      const adminRole = await Role.create({
        name: 'admin',
        displayName: 'Administrator',
        description: 'System administrator',
        roleLevel: 4,
        component: 'auth',
        isSystem: true,
        isActive: true,
      });

      const adminUser = { ...mockUser, role: adminRole };
      const result = await permissionEngine.evaluate(adminUser, 'stations.create');
      
      expect(result.allowed).toBe(true);
      expect(result.reason).not.toContain('cached');
    });
  });

  describe('Step 2: Load Role with Permissions', () => {
    it('should deny if user has no active role', async () => {
      const inactiveRole = await Role.create({
        name: 'inactive_role',
        displayName: 'Inactive Role',
        description: 'Inactive test role',
        roleLevel: 1,
        component: 'test',
        isSystem: false,
        isActive: false,
      });

      const inactiveUser = { ...mockUser, role: inactiveRole };
      const result = await permissionEngine.evaluate(inactiveUser, 'stations.create');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('inactive role');
    });

    it('should deny if user is not active', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      const result = await permissionEngine.evaluate(inactiveUser, 'stations.create');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('inactive user');
    });
  });

  describe('Step 3: Admin Bypass', () => {
    it('should allow all actions for admin role', async () => {
      const adminRole = await Role.create({
        name: 'admin',
        displayName: 'Administrator',
        description: 'System administrator',
        roleLevel: 4,
        component: 'auth',
        isSystem: true,
        isActive: true,
      });

      const adminUser = { ...mockUser, role: adminRole };
      const result = await permissionEngine.evaluate(adminUser, 'any.action');
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('Admin bypass');
    });

    it('should not bypass for non-admin roles', async () => {
      const result = await permissionEngine.evaluate(mockUser, 'stations.create');
      
      if (result.allowed) {
        expect(result.reason).not.toBe('Admin bypass');
      } else {
        expect(result.reason).not.toContain('Admin bypass');
      }
    });
  });

  describe('Step 4: Check Permission Assignment', () => {
    it('should deny if role does not have permission', async () => {
      const result = await permissionEngine.evaluate(mockUser, 'stations.create');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not assigned to role');
    });

    it('should proceed if role has permission', async () => {
      await RolePermission.create({
        role: mockRole._id,
        permission: mockPermission._id,
        policies: [],
      });

      const result = await permissionEngine.evaluate(mockUser, 'stations.create');
      
      // Should not fail at permission check
      expect(result.reason).not.toContain('not assigned to role');
    });
  });

  describe('Step 5: Evaluate Policies', () => {
    it('should deny if any policy fails', async () => {
      const mockPolicy = await Policy.create({
        name: 'test_policy',
        condition: 'email_verified',
        effect: 'allow',
        description: 'Test policy',
        isBuiltIn: false,
        isActive: true,
      });

      await RolePermission.create({
        role: mockRole._id,
        permission: mockPermission._id,
        policies: [mockPolicy._id],
      });

      // Mock policy engine to fail
      const policyEngine = require('@services/policy.engine').default;
      policyEngine.evaluate = jest.fn().mockResolvedValue(false);

      const result = await permissionEngine.evaluate(mockUser, 'stations.create');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('policy check failed');
    });

    it('should allow if all policies pass', async () => {
      await RolePermission.create({
        role: mockRole._id,
        permission: mockPermission._id,
        policies: [],
      });

      const result = await permissionEngine.evaluate(mockUser, 'stations.create');
      
      expect(result.allowed).toBe(true);
    });
  });

  describe('Step 6: Check User Overrides', () => {
    it('should deny if user has active deny override', async () => {
      await RolePermission.create({
        role: mockRole._id,
        permission: mockPermission._id,
        policies: [],
      });

      await UserPermissionOverride.create({
        user: mockUser._id,
        permission: mockPermission._id,
        effect: 'deny',
        reason: 'Test deny override',
        grantedBy: new mongoose.Types.ObjectId(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day
      });

      const result = await permissionEngine.evaluate(mockUser, 'stations.create');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('User override: deny');
    });

    it('should allow if user has active grant override', async () => {
      await UserPermissionOverride.create({
        user: mockUser._id,
        permission: mockPermission._id,
        effect: 'grant',
        reason: 'Test grant override',
        grantedBy: new mongoose.Types.ObjectId(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day
      });

      const result = await permissionEngine.evaluate(mockUser, 'stations.create');
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('User override: grant');
    });

    it('should ignore expired overrides', async () => {
      await RolePermission.create({
        role: mockRole._id,
        permission: mockPermission._id,
        policies: [],
      });

      await UserPermissionOverride.create({
        user: mockUser._id,
        permission: mockPermission._id,
        effect: 'deny',
        reason: 'Expired override',
        grantedBy: new mongoose.Types.ObjectId(),
        expiresAt: new Date(Date.now() - 1000), // Expired
      });

      const result = await permissionEngine.evaluate(mockUser, 'stations.create');
      
      // Should not be denied by expired override
      expect(result.allowed).toBe(true);
      expect(result.reason).not.toContain('User override: deny');
    });
  });

  describe('Step 7: Cache Result', () => {
    it('should cache evaluation results', async () => {
      await RolePermission.create({
        role: mockRole._id,
        permission: mockPermission._id,
        policies: [],
      });

      const result1 = await permissionEngine.evaluate(mockUser, 'stations.create');
      const result2 = await permissionEngine.evaluate(mockUser, 'stations.create');
      
      expect(result1.allowed).toBe(result2.allowed);
      expect(result2.reason).toContain('cached');
    });

    it('should flush cache for specific user', async () => {
      await RolePermission.create({
        role: mockRole._id,
        permission: mockPermission._id,
        policies: [],
      });

      await permissionEngine.evaluate(mockUser, 'stations.create');
      permissionEngine.flushCache(mockUser._id.toString());
      
      const result = await permissionEngine.evaluate(mockUser, 'stations.create');
      expect(result.reason).not.toContain('cached');
    });

    it('should flush entire cache', async () => {
      await RolePermission.create({
        role: mockRole._id,
        permission: mockPermission._id,
        policies: [],
      });

      await permissionEngine.evaluate(mockUser, 'stations.create');
      permissionEngine.flushAll();
      
      const result = await permissionEngine.evaluate(mockUser, 'stations.create');
      expect(result.reason).not.toContain('cached');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing permission gracefully', async () => {
      const result = await permissionEngine.evaluate(mockUser, 'nonexistent.permission');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not assigned to role');
    });

    it('should handle resource context in evaluation', async () => {
      await RolePermission.create({
        role: mockRole._id,
        permission: mockPermission._id,
        policies: [],
      });

      const mockResource = {
        _id: new mongoose.Types.ObjectId(),
        submittedBy: mockUser._id,
      };

      const result = await permissionEngine.evaluate(mockUser, 'stations.create', mockResource as any);
      
      expect(result.allowed).toBe(true);
    });

    it('should handle concurrent evaluations', async () => {
      await RolePermission.create({
        role: mockRole._id,
        permission: mockPermission._id,
        policies: [],
      });

      const promises = Array.from({ length: 10 }, (_, i) => 
        permissionEngine.evaluate(mockUser, 'stations.create')
      );

      const results = await Promise.all(promises);
      
      expect(results.every(r => r.allowed === results[0].allowed)).toBe(true);
    });
  });
});
