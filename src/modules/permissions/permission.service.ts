/**
 * Permission service — RBAC/ABAC management layer.
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Permissions (17 endpoints)
 *      MASTER_PROMPT.md → ACID — user_permission_override writes + audit_log in same session
 *      MASTER_PROMPT.md → SOLID OCP — extend PermissionEngine.handlers map, never modify existing
 */

import mongoose from 'mongoose';
import type {
  IPermission,
  IRole,
  IRolePermission,
  IUserPermissionOverride,
  IAuditLog,
  EvaluationResult,
  PaginationResult,
} from '@/types';
import { Permission }            from './permission.model';
import { Role }                  from './role.model';
import { RolePermission }        from './role_permission.model';
import { UserPermissionOverride } from './user_permission_override.model';
import { AuditLog }              from './audit_log.model';
import { User }                  from '@modules/users/user.model';
import { container }             from '@/container';
import ApiError                  from '@utils/ApiError';
import AuditService              from '@services/audit.service';

class PermissionService {
  // ─── Permissions catalog ────────────────────────────────────────────────

  /** GET /admin/permissions */
  async listPermissions(): Promise<IPermission[]> {
    return Permission.find().sort({ action: 1 }).lean() as unknown as IPermission[];
  }

  // ─── Roles ───────────────────────────────────────────────────────────────

  /** GET /admin/roles */
  async listRoles(): Promise<IRole[]> {
    return Role.find().sort({ roleLevel: 1 }).lean() as unknown as IRole[];
  }

  /** GET /admin/roles/:id/permissions */
  async getRolePermissions(roleId: string): Promise<IRolePermission[]> {
    return RolePermission.find({ role: roleId })
      .populate('permission')
      .populate('policies')
      .lean() as unknown as IRolePermission[];
  }

  /** POST /admin/roles/:id/permissions */
  async assignPermissionToRole(
    roleId: string,
    permissionId: string,
    policyIds: string[] = [],
    actorId: string,
    ip?: string,
  ): Promise<IRolePermission> {
    const [role, permission] = await Promise.all([
      Role.findById(roleId),
      Permission.findById(permissionId),
    ]);
    if (!role)       throw ApiError.notFound('Role not found');
    if (!permission) throw ApiError.notFound('Permission not found');

    const session = await mongoose.startSession();
    let result!: IRolePermission;
    await session.withTransaction(async () => {
      const existing = await RolePermission.findOne({ role: roleId, permission: permissionId }).session(session);
      let before: Record<string, unknown> | undefined;
      let action = 'permission.role.assigned';

      if (existing) {
        before = {
          roleId,
          permissionId,
          policyIds: existing.policies.map((policyId) => policyId.toString()),
        };
        existing.set({ policies: policyIds });
        await existing.save({ session });
        result = existing as unknown as IRolePermission;
        action = 'permission.role.updated';
      } else {
        const [doc] = await RolePermission.create([{ role: roleId, permission: permissionId, policies: policyIds }], { session });
        result = doc as unknown as IRolePermission;
      }

      await AuditService.log(
        {
          actorId,
          action,
          resource: 'role_permission',
          resourceId: result._id.toString(),
          before,
          after: { roleId, permissionId, policyIds },
          ip,
        },
        { session },
      );
    });
    await session.endSession();

    container.permissionEngine.flush(); // flush entire cache — role structure changed
    return result;
  }

  /** DELETE /admin/roles/:id/permissions/:permId */
  async removePermissionFromRole(roleId: string, permissionId: string, actorId: string, ip?: string): Promise<void> {
    const rp = await RolePermission.findOne({ role: roleId, permission: permissionId });
    if (!rp) throw ApiError.notFound('Role-permission assignment not found');

    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await RolePermission.deleteOne({ _id: rp._id }).session(session);
      await AuditService.log(
        {
          actorId,
          action: 'permission.role.removed',
          resource: 'role_permission',
          resourceId: rp._id?.toString(),
          before: {
            roleId,
            permissionId,
            policyIds: Array.isArray(rp.policies)
              ? rp.policies
                  .map((policyId) => policyId?.toString())
                  .filter((policyId): policyId is string => Boolean(policyId))
              : [],
          },
          ip,
        },
        { session },
      );
    });
    await session.endSession();

    container.permissionEngine.flush();
  }

  // ─── User overrides ──────────────────────────────────────────────────────

  /** GET /admin/users/:id/permissions */
  async getUserEffectivePermissions(userId: string): Promise<IPermission[]> {
    const user = await User.findById(userId).populate<{ role: IRole }>('role').lean();
    if (!user) throw ApiError.notFound('User not found');

    // Base permissions from role
    const rolePerms = await RolePermission.find({ role: (user.role as IRole)._id })
      .populate<{ permission: IPermission }>('permission')
      .lean();
    const base = rolePerms.map(rp => rp.permission as IPermission);

    // User-specific overrides
    const overrides = await UserPermissionOverride.find({ user: userId, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] })
      .populate<{ permission: IPermission }>('permission')
      .lean();

    // Apply grants (add) and denies (remove)
    const result: Map<string, IPermission> = new Map(base.map(p => [p._id.toString(), p]));
    for (const ov of overrides) {
      const perm = ov.permission as unknown as IPermission;
      const id   = perm._id.toString();
      if (ov.effect === 'grant') result.set(id, perm);
      else result.delete(id);
    }
    return Array.from(result.values());
  }

  /** POST /admin/users/:id/permissions */
  async overrideUserPermission(
    userId: string,
    permissionId: string,
    effect: 'grant' | 'deny',
    grantedById: string,
    reason?: string,
    expiresAt?: Date,
    ip?: string,
  ): Promise<IUserPermissionOverride> {
    const [targetUser, permission] = await Promise.all([
      User.findById(userId),
      Permission.findById(permissionId),
    ]);
    if (!targetUser) throw ApiError.notFound('User not found');
    if (!permission) throw ApiError.notFound('Permission not found');

    const session = await mongoose.startSession();
    let override!: IUserPermissionOverride;
    await session.withTransaction(async () => {
      const previous = await UserPermissionOverride.findOne({ user: userId, permission: permissionId }).session(session);

      const doc = await UserPermissionOverride.findOneAndUpdate(
        { user: userId, permission: permissionId },
        { $set: { effect, reason, grantedBy: grantedById, expiresAt: expiresAt ?? null } },
        { upsert: true, returnDocument: 'after', session },
      );
      override = doc as unknown as IUserPermissionOverride;

      await AuditService.log(
        {
          actorId: grantedById,
          action: previous ? 'permission.override.updated' : 'permission.override.created',
          resource: 'user_permission_override',
          resourceId: override._id.toString(),
          before: previous
            ? {
                userId,
                permissionId,
                effect: previous.effect,
                reason: previous.reason,
                expiresAt: previous.expiresAt,
              }
            : undefined,
          after: { userId, permissionId, effect, reason, expiresAt },
          ip,
        },
        { session },
      );
    });
    await session.endSession();

    container.permissionEngine.flush(userId);
    return override;
  }

  /** DELETE /admin/users/:id/permissions/:permId */
  async removeUserPermissionOverride(userId: string, permissionId: string, actorId: string, ip?: string): Promise<void> {
    const override = await UserPermissionOverride.findOne({ user: userId, permission: permissionId });
    if (!override) throw ApiError.notFound('Permission override not found');

    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await UserPermissionOverride.deleteOne({ _id: override._id }).session(session);
      await AuditService.log(
        {
          actorId,
          action: 'permission.override.removed',
          resource: 'user_permission_override',
          resourceId: override._id.toString(),
          before: {
            userId,
            permissionId,
            effect: override.effect,
            reason: override.reason,
            expiresAt: override.expiresAt,
          },
          ip,
        },
        { session },
      );
    });
    await session.endSession();

    container.permissionEngine.flush(userId);
  }

  // ─── Permission check ─────────────────────────────────────────────────────

  /** POST /permissions/check */
  async checkAccess(
    userId: string,
    action: string,
    context: Record<string, unknown> = {},
    ip?: string,
  ): Promise<EvaluationResult> {
    const user = await User.findById(userId).populate<{ role: IRole }>('role').lean();
    if (!user) throw ApiError.notFound('User not found');

    const userForPerm = {
      _id:            user._id,
      role:           (user.role as IRole).name as string,
      roleLevel:      (user.role as IRole).roleLevel,
      isEmailVerified: user.isEmailVerified,
      isActive:       user.isActive,
      isBanned:       user.isBanned,
    };

    const result = await container.permissionEngine.evaluate(
      userForPerm,
      action as import('@/types').PermissionAction,
    );

    await AuditService.log({
      actorId: userId,
      action: 'permission.check',
      resource: 'permission',
      after: {
        requestedAction: action,
        allowed: result.allowed,
        reason: result.reason,
        policy: result.policy,
        context,
      },
      ip,
    });

    return result;
  }

  // ─── Audit logs ──────────────────────────────────────────────────────────

  /** GET /admin/audit-logs */
  async listAuditLogs(query: Record<string, unknown>): Promise<PaginationResult<IAuditLog>> {
    const page  = Number(query.page  ?? 1);
    const limit = Number(query.limit ?? 20);
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (query.actor)    filter.actor    = query.actor;
    if (query.action)   filter.action   = { $regex: query.action, $options: 'i' };
    if (query.resource) filter.resource = query.resource;
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) (filter.createdAt as Record<string, unknown>).$gte = new Date(query.from as string);
      if (query.to)   (filter.createdAt as Record<string, unknown>).$lte = new Date(query.to as string);
    }

    const [data, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);

    return { data: data as unknown as IAuditLog[], total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ─── Quota stats ─────────────────────────────────────────────────────────

  /** GET /admin/quota */
  async getQuotaStats(): Promise<Record<string, unknown>[]> {
    return container.quotaService.getStats();
  }
}

export default new PermissionService();
