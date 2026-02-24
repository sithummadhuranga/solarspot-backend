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
  async assignPermissionToRole(roleId: string, permissionId: string, policyIds: string[] = []): Promise<IRolePermission> {
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
      if (existing) {
        existing.set({ policies: policyIds });
        await existing.save({ session });
        result = existing as unknown as IRolePermission;
      } else {
        const [doc] = await RolePermission.create([{ role: roleId, permission: permissionId, policies: policyIds }], { session });
        result = doc as unknown as IRolePermission;
      }
    });
    await session.endSession();

    container.permissionEngine.flush(); // flush entire cache — role structure changed
    return result;
  }

  /** DELETE /admin/roles/:id/permissions/:permId */
  async removePermissionFromRole(roleId: string, permissionId: string): Promise<void> {
    const rp = await RolePermission.findOne({ role: roleId, permission: permissionId });
    if (!rp) throw ApiError.notFound('Role-permission assignment not found');

    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await RolePermission.deleteOne({ _id: rp._id }).session(session);
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
      const doc = await UserPermissionOverride.findOneAndUpdate(
        { user: userId, permission: permissionId },
        { $set: { effect, reason, grantedBy: grantedById, expiresAt: expiresAt ?? null } },
        { upsert: true, new: true, session },
      );
      override = doc as unknown as IUserPermissionOverride;

      await AuditLog.create([{
        actor:      grantedById,
        action:     `permission.override.${effect}`,
        resource:   'user_permission_override',
        resourceId: override._id,
        after:      { userId, permissionId, effect, reason, expiresAt },
        ip:         undefined,
      }], { session });
    });
    await session.endSession();

    container.permissionEngine.flush(userId);
    return override;
  }

  /** DELETE /admin/users/:id/permissions/:permId */
  async removeUserPermissionOverride(userId: string, permissionId: string, actorId: string): Promise<void> {
    const override = await UserPermissionOverride.findOne({ user: userId, permission: permissionId });
    if (!override) throw ApiError.notFound('Permission override not found');

    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await UserPermissionOverride.deleteOne({ _id: override._id }).session(session);
      await AuditLog.create([{
        actor:      actorId,
        action:     'permission.override.removed',
        resource:   'user_permission_override',
        resourceId: override._id,
        before:     { userId, permissionId, effect: override.effect },
      }], { session });
    });
    await session.endSession();

    container.permissionEngine.flush(userId);
  }

  // ─── Permission check ─────────────────────────────────────────────────────

  /** POST /permissions/check */
  async checkAccess(userId: string, action: string, context: Record<string, unknown> = {}): Promise<EvaluationResult> {
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

    // context is passed by callers but the engine's resource param is a Document;
    // for programmatic checks (no loaded resource), we pass undefined.
    void context;
    return container.permissionEngine.evaluate(userForPerm, action as import('@/types').PermissionAction);
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
