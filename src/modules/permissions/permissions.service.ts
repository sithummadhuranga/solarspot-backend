import mongoose from 'mongoose';
import Role from './models/role.model';
import Permission from './models/permission.model';
import Policy from './models/policy.model';
import RolePermission from './models/role-permission.model';
import UserPermissionOverride from './models/user-permission-override.model';
import AuditLog from './models/audit-log.model';
import Notification from './models/notification.model';
import ApiError from '@utils/ApiError';
import logger from '@utils/logger';
import EmailService from '@utils/email.service';
import PermissionEngine from '@services/permission.engine';

/**
 * Permissions Service
 * 
 * Business logic for advanced PBAC system.
 * Handles roles, permissions, policies, overrides, audit logs, and notifications.
 */
class PermissionsService {
  // ================================
  // ROLES
  // ================================

  async getAllRoles() {
    return Role.find().sort({ roleLevel: 1 }).lean();
  }

  async createRole(data: {
    name: string;
    displayName: string;
    description: string;
    roleLevel: number;
    component: string;
  }) {
    const role = await Role.create(data);
    logger.info(`Role created: ${role.name}`);
    return role;
  }

  async updateRole(roleId: string, updates: Partial<{
    displayName: string;
    description: string;
  }>) {
    const role = await Role.findById(roleId);

    if (!role) {
      throw new ApiError(404, 'Role not found');
    }

    if (role.isSystem) {
      throw new ApiError(403, 'Cannot modify system roles');
    }

    Object.assign(role, updates);
    await role.save();

    logger.info(`Role updated: ${role.name}`);
    return role;
  }

  async deleteRole(roleId: string) {
    const role = await Role.findById(roleId);

    if (!role) {
      throw new ApiError(404, 'Role not found');
    }

    if (role.isSystem) {
      throw new ApiError(403, 'Cannot delete system roles (guest, user, moderator, admin)');
    }

    // Check if any users have this role
    const { default: User } = await import('@modules/users/user.model');
    const usersWithRole = await User.countDocuments({ role: role.name });

    if (usersWithRole > 0) {
      throw new ApiError(400, `Cannot delete role — ${usersWithRole} users currently assigned`);
    }

    await role.deleteOne();
    logger.info(`Role deleted: ${role.name}`);
  }

  // ================================
  // PERMISSIONS
  // ================================

  async getAllPermissions() {
    return Permission.find().sort({ component: 1, action: 1 }).lean();
  }

  async createPermission(data: {
    action: string;
    resource: string;
    component: string;
    description: string;
  }) {
    const permission = await Permission.create(data);
    logger.info(`Permission created: ${permission.action}`);
    return permission;
  }

  // ================================
  // POLICIES
  // ================================

  async getAllPolicies() {
    return Policy.find().sort({ name: 1 }).lean();
  }

  async createPolicy(data: {
    name: string;
    displayName: string;
    description: string;
    condition: any;
    effect: 'allow' | 'deny';
    config?: Record<string, any>;
  }) {
    const policy = await Policy.create(data);
    logger.info(`Policy created: ${policy.name}`);
    return policy;
  }

  async updatePolicy(policyId: string, updates: Partial<{
    displayName: string;
    description: string;
    config: Record<string, any>;
  }>) {
    const policy = await Policy.findById(policyId);

    if (!policy) {
      throw new ApiError(404, 'Policy not found');
    }

    if (policy.isBuiltIn) {
      throw new ApiError(403, 'Cannot modify built-in policies');
    }

    Object.assign(policy, updates);
    await policy.save();

    logger.info(`Policy updated: ${policy.name}`);
    return policy;
  }

  // ================================
  // POLICY ATTACHMENT (Role-Permission-Policy Join)
  // ================================

  async attachPolicyToRolePermission(
    roleId: string,
    permissionId: string,
    policyId: string
  ) {
    const [role, permission, policy] = await Promise.all([
      Role.findById(roleId),
      Permission.findById(permissionId),
      Policy.findById(policyId),
    ]);

    if (!role) throw new ApiError(404, 'Role not found');
    if (!permission) throw new ApiError(404, 'Permission not found');
    if (!policy) throw new ApiError(404, 'Policy not found');

    const rolePermission = await RolePermission.findOne({
      role: roleId,
      permission: permissionId,
    });

    if (!rolePermission) {
      throw new ApiError(404, 'Role does not have this permission — assign it first');
    }

    if (rolePermission.policies.includes(policyId as any)) {
      throw new ApiError(400, 'Policy already attached');
    }

    rolePermission.policies.push(policyId as any);
    await rolePermission.save();

    logger.info(`Policy attached: ${policy.name} → ${role.name}.${permission.action}`);
    PermissionEngine.flushAll();

    return rolePermission;
  }

  async detachPolicyFromRolePermission(
    roleId: string,
    permissionId: string,
    policyId: string
  ) {
    const rolePermission = await RolePermission.findOne({
      role: roleId,
      permission: permissionId,
    });

    if (!rolePermission) {
      throw new ApiError(404, 'Role-permission mapping not found');
    }

    const index = rolePermission.policies.indexOf(policyId as any);

    if (index === -1) {
      throw new ApiError(404, 'Policy not attached to this role-permission');
    }

    rolePermission.policies.splice(index, 1);
    await rolePermission.save();

    logger.info(`Policy detached from role-permission`);
    PermissionEngine.flushAll();

    return rolePermission;
  }

  // ================================
  // USER OVERRIDES
  // ================================

  async getUserOverrides(userId: string) {
    return UserPermissionOverride.find({ user: userId })
      .populate('permission')
      .populate('grantedBy', 'displayName email')
      .sort({ createdAt: -1 })
      .lean();
  }

  async createUserOverride(data: {
    userId: string;
    permissionId: string;
    effect: 'grant' | 'deny';
    reason: string;
    expiresAt?: Date;
    grantedById: string;
  }) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const [user, permission, grantedBy] = await Promise.all([
        (await import('@modules/users/user.model')).default.findById(data.userId),
        Permission.findById(data.permissionId),
        (await import('@modules/users/user.model')).default.findById(data.grantedById),
      ]);

      if (!user) throw new ApiError(404, 'User not found');
      if (!permission) throw new ApiError(404, 'Permission not found');
      if (!grantedBy) throw new ApiError(404, 'Granting user not found');

      const override = new UserPermissionOverride({
        user: data.userId,
        permission: data.permissionId,
        effect: data.effect,
        reason: data.reason,
        expiresAt: data.expiresAt,
        grantedBy: data.grantedById,
      });
      await override.save({ session });

      // Log audit trail
      const auditLog = new AuditLog({
        user: data.userId,
        performedBy: data.grantedById,
        action: 'permission.override.create',
        targetModel: 'UserPermissionOverride',
        targetId: override._id,
        changes: {
          before: null,
          after: { effect: data.effect, permission: permission.action },
        },
        metadata: { reason: data.reason },
      });
      await auditLog.save({ session });

      // Send notification to user
      const notification = new Notification({
        user: data.userId,
        type: 'permission_change',
        title: 'Permission Override Applied',
        message: `Your permissions have been ${data.effect === 'grant' ? 'granted' : 'revoked'} for ${permission.action}`,
        targetModel: 'UserPermissionOverride',
        targetId: override._id,
        metadata: { reason: data.reason },
      });
      await notification.save({ session });

      await session.commitTransaction();

      // Flush cache for this user
      PermissionEngine.flushCache(data.userId);

      // Send email notification
      await EmailService.sendPermissionChangeEmail(
        data.userId,
        data.grantedById,
        `Permission override: ${permission.action}`,
        data.effect,
        data.reason,
        `You now ${data.effect === 'grant' ? 'CAN' : 'CANNOT'} perform: ${permission.action}`
      );

      logger.info(`User override created: ${user.email} → ${permission.action} (${data.effect})`);

      return override;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  async deleteUserOverride(overrideId: string, deletedById: string) {
    const override = await UserPermissionOverride.findById(overrideId)
      .populate('user')
      .populate('permission');

    if (!override) {
      throw new ApiError(404, 'Override not found');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const auditLog = new AuditLog({
        user: override.user._id,
        performedBy: deletedById,
        action: 'permission.override.delete',
        targetModel: 'UserPermissionOverride',
        targetId: overrideId,
        changes: {
          before: { effect: override.effect, permission: (override.permission as any).action },
          after: null,
        },
      });
      await auditLog.save({ session });

      await override.deleteOne({ session });
      await session.commitTransaction();

      PermissionEngine.flushCache(override.user._id.toString());

      logger.info(`User override deleted: ${overrideId}`);
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  // ================================
  // AUDIT LOGS
  // ================================

  async getAuditLogs(filters: {
    userId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }) {
    const query: any = {};

    if (filters.userId) query.user = filters.userId;
    if (filters.action) query.action = new RegExp(filters.action, 'i');
    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) query.timestamp.$gte = filters.startDate;
      if (filters.endDate) query.timestamp.$lte = filters.endDate;
    }

    return AuditLog.find(query)
      .populate('user', 'displayName email')
      .populate('performedBy', 'displayName email')
      .sort({ timestamp: -1 })
      .limit(filters.limit || 100)
      .lean();
  }

  // ================================
  // NOTIFICATIONS
  // ================================

  async getUserNotifications(userId: string, unreadOnly = false) {
    const query: any = { user: userId };
    if (unreadOnly) query.readAt = null;

    return Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
  }

  async markNotificationAsRead(notificationId: string, userId: string) {
    const notification = await Notification.findOne({
      _id: notificationId,
      user: userId,
    });

    if (!notification) {
      throw new ApiError(404, 'Notification not found');
    }

    if (notification.readAt) {
      return notification; // Already read
    }

    notification.readAt = new Date();
    await notification.save();

    return notification;
  }

  // ================================
  // CACHE MANAGEMENT
  // ================================

  async reloadPermissions() {
    PermissionEngine.flushAll();
    logger.info('All permission caches flushed');
    return { success: true, message: 'Permission caches reloaded' };
  }
}

export default new PermissionsService();
