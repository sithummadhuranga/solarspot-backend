import NodeCache from 'node-cache';
import { Document } from 'mongoose';
import { IUser } from '@modules/users/user.model';
import Role, { IRole } from '@modules/permissions/models/role.model';
import Permission from '@modules/permissions/models/permission.model';
import RolePermission from '@modules/permissions/models/role-permission.model';
import UserPermissionOverride from '@modules/permissions/models/user-permission-override.model';
import PolicyEngine from '@services/policy.engine';
import logger from '@utils/logger';

// Permission cache: 5-minute TTL
const permissionCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

export interface EvaluationResult {
  allowed: boolean;
  reason: string;
  cached: boolean;
}

/**
 * PermissionEngine — 7-step PBAC evaluation process.
 *
 * Steps:
 * 1. Check cache for userId:action:resourceId combo
 * 2. Load user role (if not populated)
 * 3. Admin bypass — admins are always allowed
 * 4. Check if role has the permission
 * 5. Evaluate all policies attached to role+permission
 * 6. Check user-specific overrides (grants/denies)
 * 7. Cache result and return
 */
class PermissionEngine {
  /**
   * Evaluate whether a user can perform an action on a resource.
   *
   * @param user - The user attempting the action (must have role populated or role string)
   * @param action - Permission action (e.g., 'stations.create')
   * @param resource - Optional resource document (for owner_match, field_equals policies)
   * @returns EvaluationResult with allowed boolean and reason
   */
  async evaluate(
    user: IUser,
    action: string,
    resource?: Document
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    // ─── Step 1: Check cache ───────────────────────────────────────────────
    const cacheKey = this.buildCacheKey(user._id.toString(), action, resource?._id?.toString());
    const cached = permissionCache.get<boolean>(cacheKey);

    if (cached !== undefined) {
      logger.debug('Permission cache hit', { userId: user._id, action, cached });
      return {
        allowed: cached,
        reason: cached ? 'Allowed (cached)' : 'Denied (cached)',
        cached: true,
      };
    }

    // ─── Step 2: Load user role ────────────────────────────────────────────
    let userRole: IRole | null = null;

    if (typeof user.role === 'string') {
      userRole = await Role.findOne({ name: user.role, isActive: true }).lean();
    } else {
      userRole = user.role as unknown as IRole; // already populated
    }

    if (!userRole) {
      logger.warn('User role not found or inactive', { userId: user._id, role: user.role });
      return this.denyAndCache(cacheKey, 'User role not found or inactive');
    }

    // ─── Step 3: Admin bypass ──────────────────────────────────────────────
    if (userRole.name === 'admin') {
      logger.debug('Admin bypass — always allowed', { userId: user._id, action });
      return this.allowAndCache(cacheKey, 'Admin bypass');
    }

    // ─── Step 4: Check if role has permission ──────────────────────────────
    const permission = await Permission.findOne({ action, isActive: true }).lean();

    if (!permission) {
      logger.warn('Permission action not found', { action });
      return this.denyAndCache(cacheKey, `Permission '${action}' does not exist`);
    }

    const rolePermission = await RolePermission.findOne({
      role: userRole._id,
      permission: permission._id,
      isActive: true,
    })
      .populate('policies')
      .lean();

    if (!rolePermission) {
      logger.debug('Role does not have permission', {
        userId: user._id,
        role: userRole.name,
        action,
      });
      // Don't cache yet — user override might grant it in step 6
    } else {
      // ─── Step 5: Evaluate policies ───────────────────────────────────────
      const policies = rolePermission.policies as unknown as Array<{
        _id: unknown;
        name: string;
        condition: string;
        effect: 'allow' | 'deny';
        config: Record<string, unknown>;
      }>;

      const policyEngine = (await import('@services/policy.engine')).default;

      for (const policy of policies) {
        if (!policy) continue; // skip null/undefined policies

        const policyPasses = await policyEngine.evaluate(
          policy as never,
          user,
          resource
        );

        // If policy effect is 'deny' and it passes → DENY immediately
        if (policy.effect === 'deny' && policyPasses) {
          logger.debug('Policy denied access', {
            userId: user._id,
            action,
            policy: policy.name,
          });
          return this.denyAndCache(cacheKey, `Policy denied: ${policy.name}`);
        }

        // If policy effect is 'allow' and it fails → DENY immediately
        if (policy.effect === 'allow' && !policyPasses) {
          logger.debug('Policy requirement not met', {
            userId: user._id,
            action,
            policy: policy.name,
          });
          return this.denyAndCache(cacheKey, `Policy requirement not met: ${policy.name}`);
        }
      }

      // All policies passed — tentatively allowed (check overrides next)
    }

    // ─── Step 6: Check user-specific overrides ─────────────────────────────
    const override = await UserPermissionOverride.findOne({
      user: user._id,
      permission: permission._id,
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    }).lean();

    if (override) {
      if (override.effect === 'grant') {
        logger.debug('User override grants permission', {
          userId: user._id,
          action,
          overrideId: override._id,
        });
        return this.allowAndCache(cacheKey, `User override: granted`);
      } else if (override.effect === 'deny') {
        logger.debug('User override denies permission', {
          userId: user._id,
          action,
          overrideId: override._id,
        });
        return this.denyAndCache(cacheKey, `User override: denied`);
      }
    }

    // ─── Step 7: Final decision ────────────────────────────────────────────
    if (rolePermission) {
      // Role has permission + all policies passed + no deny override → ALLOW
      const elapsed = Date.now() - startTime;
      logger.debug('Permission granted', { userId: user._id, action, elapsedMs: elapsed });
      return this.allowAndCache(cacheKey, 'Role has permission and all policies passed');
    } else {
      // Role doesn't have permission + no grant override → DENY
      return this.denyAndCache(cacheKey, `Role '${userRole.name}' does not have permission '${action}'`);
    }
  }

  /**
   * Flush cache for a specific user (after permission/role changes).
   */
  flushCache(userId: string): void {
    const keys = permissionCache.keys();
    const userKeys = keys.filter((key) => key.startsWith(`${userId}:`));
    permissionCache.del(userKeys);
    logger.info('Permission cache flushed for user', { userId, keyCount: userKeys.length });
  }

  /**
   * Flush entire permission cache (after seeding or global permission changes).
   */
  flushAll(): void {
    permissionCache.flushAll();
    logger.info('All permission cache flushed');
  }

  /**
   * Build cache key: userId:action[:resourceId]
   */
  private buildCacheKey(userId: string, action: string, resourceId?: string): string {
    return resourceId ? `${userId}:${action}:${resourceId}` : `${userId}:${action}`;
  }

  /**
   * Allow and cache the result.
   */
  private allowAndCache(cacheKey: string, reason: string): EvaluationResult {
    permissionCache.set(cacheKey, true);
    return { allowed: true, reason, cached: false };
  }

  /**
   * Deny and cache the result.
   */
  private denyAndCache(cacheKey: string, reason: string): EvaluationResult {
    permissionCache.set(cacheKey, false);
    return { allowed: false, reason, cached: false };
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────
const permissionEngine = new PermissionEngine();

export default permissionEngine;
export { PermissionEngine };
