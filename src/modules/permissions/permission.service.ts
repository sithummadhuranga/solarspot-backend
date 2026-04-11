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
  IUserPermissionMatrixItem,
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

const TRANSACTION_UNSUPPORTED_MESSAGE = 'Transaction numbers are only allowed on a replica set member or mongos';

function isTransactionUnsupportedError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(TRANSACTION_UNSUPPORTED_MESSAGE);
}

async function runWithTransactionFallback<T>(
  operation: (session: mongoose.ClientSession | null) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();

  try {
    try {
      let result!: T;
      await session.withTransaction(async () => {
        result = await operation(session);
      });
      return result;
    } catch (error) {
      // Local standalone Mongo instances reject transactions. Retry the same write path
      // without a session so admin tooling still works in development.
      if (!isTransactionUnsupportedError(error)) {
        throw error;
      }

      return operation(null);
    }
  } finally {
    await session.endSession();
  }
}

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

    const result = await runWithTransactionFallback(async (session) => {
      const existingQuery = RolePermission.findOne({ role: roleId, permission: permissionId });
      const existing = session
        ? await existingQuery.session(session)
        : await existingQuery;

      if (existing) {
        before = {
          roleId,
          permissionId,
          policyIds: existing.policies.map((policyId) => policyId.toString()),
        };
        existing.set({ policies: policyIds });
        if (session) {
          await existing.save({ session });
        } else {
          await existing.save();
        }

        return existing as unknown as IRolePermission;
      }

      const [doc] = session
        ? await RolePermission.create([{ role: roleId, permission: permissionId, policies: policyIds }], { session })
        : await RolePermission.create([{ role: roleId, permission: permissionId, policies: policyIds }]);

      return doc as unknown as IRolePermission;
    });

    container.permissionEngine.flush(); // flush entire cache — role structure changed
    return result;
  }

  /** DELETE /admin/roles/:id/permissions/:permId */
  async removePermissionFromRole(roleId: string, permissionId: string, actorId: string, ip?: string): Promise<void> {
    const rp = await RolePermission.findOne({ role: roleId, permission: permissionId });
    if (!rp) throw ApiError.notFound('Role-permission assignment not found');

    await runWithTransactionFallback(async (session) => {
      const deleteQuery = RolePermission.deleteOne({ _id: rp._id });
      if (session) {
        await deleteQuery.session(session);
        return;
      }

      await deleteQuery;
    });

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

  /** GET /admin/users/:id/permissions/matrix */
  async getUserPermissionMatrix(userId: string): Promise<IUserPermissionMatrixItem[]> {
    const user = await User.findById(userId).populate<{ role: IRole }>('role').lean();
    if (!user) throw ApiError.notFound('User not found');

    const [permissions, rolePerms, overrides] = await Promise.all([
      Permission.find().sort({ component: 1, action: 1 }).lean() as unknown as Promise<IPermission[]>,
      RolePermission.find({ role: (user.role as IRole)._id }).select('permission').lean() as unknown as Promise<Array<{ permission: import('mongoose').Types.ObjectId }>>,
      UserPermissionOverride.find({
        user: userId,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      })
        .populate<{ permission: IPermission }>('permission')
        .lean() as unknown as Promise<Array<IUserPermissionOverride & { permission: IPermission }>>,
    ]);

    const roleGrantedIds = new Set(rolePerms.map((entry) => entry.permission.toString()));
    const overrideMap = new Map(
      overrides.map((override) => [override.permission._id.toString(), override] as const),
    );

    return permissions.map((permission) => {
      const permissionId = permission._id.toString();
      const roleGranted = roleGrantedIds.has(permissionId);
      const override = overrideMap.get(permissionId);

      if (override?.effect === 'grant') {
        return {
          permission,
          allowed: true,
          roleGranted,
          source: 'override-grant',
          overrideEffect: 'grant',
          overrideReason: override.reason ?? null,
          overrideExpiresAt: override.expiresAt ?? null,
        } satisfies IUserPermissionMatrixItem;
      }

      if (override?.effect === 'deny') {
        return {
          permission,
          allowed: false,
          roleGranted,
          source: 'override-deny',
          overrideEffect: 'deny',
          overrideReason: override.reason ?? null,
          overrideExpiresAt: override.expiresAt ?? null,
        } satisfies IUserPermissionMatrixItem;
      }

      return {
        permission,
        allowed: roleGranted,
        roleGranted,
        source: roleGranted ? 'role' : 'none',
        overrideEffect: null,
        overrideReason: null,
        overrideExpiresAt: null,
      } satisfies IUserPermissionMatrixItem;
    });
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

    const override = await runWithTransactionFallback(async (session) => {
      const doc = await UserPermissionOverride.findOneAndUpdate(
        { user: userId, permission: permissionId },
        { $set: { effect, reason, grantedBy: grantedById, expiresAt: expiresAt ?? null } },
        {
          upsert: true,
          returnDocument: 'after',
          ...(session ? { session } : {}),
        },
      );
      const nextOverride = doc as unknown as IUserPermissionOverride;

      const auditEntry = [{
        actor:      grantedById,
        action:     `permission.override.${effect}`,
        resource:   'user_permission_override',
        resourceId: nextOverride._id,
        after:      { userId, permissionId, effect, reason, expiresAt },
        ip:         undefined,
      }];

      if (session) {
        await AuditLog.create(auditEntry, { session });
      } else {
        await AuditLog.create(auditEntry);
      }

      return nextOverride;
    });

    container.permissionEngine.flush(userId);
    return override;
  }

  /** DELETE /admin/users/:id/permissions/:permId */
  async removeUserPermissionOverride(userId: string, permissionId: string, actorId: string, ip?: string): Promise<void> {
    const override = await UserPermissionOverride.findOne({ user: userId, permission: permissionId });
    if (!override) throw ApiError.notFound('Permission override not found');

    await runWithTransactionFallback(async (session) => {
      const deleteQuery = UserPermissionOverride.deleteOne({ _id: override._id });
      if (session) {
        await deleteQuery.session(session);
      } else {
        await deleteQuery;
      }

      const auditEntry = [{
        actor:      actorId,
        action:     'permission.override.removed',
        resource:   'user_permission_override',
        resourceId: override._id,
        before:     { userId, permissionId, effect: override.effect },
      }];

      if (session) {
        await AuditLog.create(auditEntry, { session });
        return;
      }

      await AuditLog.create(auditEntry);
    });

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
