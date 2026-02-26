/**
 * PermissionEngine — single responsibility: evaluate whether a user can perform an action.
 *
 * Owner: Member 4
 * Ref:  PROJECT_OVERVIEW.md → Permissions — 35 Actions
 *       PROJECT_OVERVIEW.md → Policies — 13 Built-in
 *       MASTER_PROMPT.md → SOLID → Open/Closed (PolicyEngine)
 *       MASTER_PROMPT.md → Permission System → Never Hardcode Permission Checks in Services
 *
 * This engine is called by checkPermission middleware — NEVER call it from services.
 * Services trust the middleware layer has already authorised the caller.
 *
 * Cache strategy:
 *   Permission graph is cached in-process for 5 minutes (node-cache).
 *   Any mutation to roles/permissions/overrides MUST call flush() to invalidate.
 *
 * DI: Wired in src/container.ts at startup.
 */

import { Document, Types } from 'mongoose';
import NodeCache from 'node-cache';
import { RolePermission } from '@modules/permissions/role_permission.model';
import { UserPermissionOverride } from '@modules/permissions/user_permission_override.model';
import { Review } from '@modules/reviews/review.model';
import logger from '@utils/logger';
import { IUserForPermission, EvaluationResult, PermissionAction, PolicyCondition, IPolicy } from '@/types';

// ─── Policy condition handler signature ─────────────────────────────────────
// OCP: add a new PolicyCondition by adding ONE handler + registering it below.
// Never modify existing handlers.
type ConditionHandler = (
  config: Record<string, unknown>,
  user: IUserForPermission,
  resource?: Document,
) => Promise<boolean>;

const CACHE_TTL_SECONDS = 300; // 5 minutes

// ─── PermissionEngine ────────────────────────────────────────────────────────
export class PermissionEngine {
  private readonly cache = new NodeCache({ stdTTL: CACHE_TTL_SECONDS, useClones: false });

  // OCP: policy condition handlers registry — add handler here, never modify existing ones
  private readonly conditionHandlers = new Map<PolicyCondition, ConditionHandler>([
    ['email_verified',  this.handleEmailVerified.bind(this)],
    ['account_active',  this.handleAccountActive.bind(this)],
    ['checkBanned',     this.handleCheckBanned.bind(this)],
    ['owner_match',     this.handleOwnerMatch.bind(this)],
    ['unique_review',   this.handleUniqueReview.bind(this)],
    ['ownership_check', this.handleOwnershipCheck.bind(this)],
    ['no_self_vote',    this.handleNoSelfVote.bind(this)],
    ['time_window',     this.handleTimeWindow.bind(this)],
    ['role_minimum',    this.handleRoleMinimum.bind(this)],
    ['field_equals',    this.handleFieldEquals.bind(this)],
  ]);

  /**
   * Evaluate whether `user` is allowed to perform `action` on optional `resource`.
   *
   * Algorithm:
   * 1. Admin bypass — roleLevel 4 always allowed
   * 2. Look up role's role_permissions from DB (cached for 5 mins)
   * 3. Find the matching permission for `action`
   * 4. If no permission found → deny
   * 5. Check per-user override (grant or deny override wins over role default)
   * 6. Evaluate attached policies in order — any deny policy blocks, all allow policies must pass
   * 7. Return EvaluationResult
   */
  async evaluate(
    user: IUserForPermission,
    action: PermissionAction,
    resource?: Document,
  ): Promise<EvaluationResult> {
    // Step 1: Admin bypass — admins are always allowed, no policy evaluation
    // This is intentional: if an admin is locked out, there is no recovery path.
    if (user.roleLevel >= 4) {
      return { allowed: true, reason: 'Admin bypass' };
    }

    try {
      // Step 2: Load role's permissions (from cache or DB)
      const rolePermissions = await this.getRolePermissions(user.role);

      // Step 3: Find the matching permission for this action
      const rolePermission = rolePermissions.find(
        (rp: { permission: { action: string }; policies: IPolicy[] }) =>
          rp.permission?.action === action,
      );

      // Step 4: If the role doesn't have this permission at all → deny
      if (!rolePermission) {
        // Step 4b: But check for user-level grant override first
        const override = await this.getUserOverride(user._id, action);
        if (override?.effect === 'grant') {
          return { allowed: true, reason: 'User override: grant' };
        }
        return { allowed: false, reason: `Role does not have permission: ${action}` };
      }

      // Step 5: Check per-user override — takes precedence over role default
      const override = await this.getUserOverride(user._id, action);
      if (override) {
        if (override.effect === 'deny') {
          return { allowed: false, reason: 'User override: deny' };
        }
        if (override.effect === 'grant') {
          return { allowed: true, reason: 'User override: grant' };
        }
      }

      // Step 6: Evaluate attached policies
      const policies: IPolicy[] = rolePermission.policies ?? [];
      for (const policy of policies) {
        const handler = this.conditionHandlers.get(policy.condition as PolicyCondition);
        if (!handler) {
          logger.warn(`PermissionEngine: unknown policy condition "${policy.condition}"`);
          continue;
        }

        const conditionMet = await handler(
          (policy.config ?? {}) as Record<string, unknown>,
          user,
          resource,
        );

        if (policy.effect === 'deny' && conditionMet) {
          return { allowed: false, reason: `Policy denied: ${policy.slug}` };
        }
        if (policy.effect === 'allow' && !conditionMet) {
          return { allowed: false, reason: `Policy condition not met: ${policy.slug}` };
        }
      }

      return { allowed: true };
    } catch (err) {
      logger.error(`PermissionEngine.evaluate error for action=${action}:`, err);
      return { allowed: false, reason: 'Internal permission evaluation error' };
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async getRolePermissions(roleId: string): Promise<Array<{ permission: { action: string }; policies: IPolicy[] }>> {
    const cacheKey = `role_perms:${roleId}`;
    const cached = this.cache.get<Array<{ permission: { action: string }; policies: IPolicy[] }>>(cacheKey);
    if (cached) return cached;

    const rolePerms = await RolePermission.find({ role: roleId })
      .populate('permission')
      .populate('policies')
      .lean();

    this.cache.set(cacheKey, rolePerms);
    return rolePerms as unknown as Array<{ permission: { action: string }; policies: IPolicy[] }>;
  }

  private async getUserOverride(
    userId: Types.ObjectId,
    action: string,
  ): Promise<{ effect: 'grant' | 'deny' } | null> {
    const cacheKey = `user_override:${userId.toString()}:${action}`;
    const cached = this.cache.get<{ effect: 'grant' | 'deny' } | null>(cacheKey);
    if (cached !== undefined) return cached;

    // Filter out expired overrides at query time
    const override = await UserPermissionOverride.findOne({
      user: userId,
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
    })
      .populate({
        path: 'permission',
        match: { action },
      })
      .lean();

    const result = override?.permission ? { effect: override.effect as 'grant' | 'deny' } : null;
    this.cache.set(cacheKey, result);
    return result;
  }

  // ─── Policy condition handlers ───────────────────────────────────────────
  // OCP: each handler is self-contained. Add new ones; never edit existing.

  private async handleEmailVerified(_cfg: Record<string, unknown>, user: IUserForPermission): Promise<boolean> {
    return user.isEmailVerified;
  }

  private async handleAccountActive(_cfg: Record<string, unknown>, user: IUserForPermission): Promise<boolean> {
    return user.isActive;
  }

  private async handleCheckBanned(_cfg: Record<string, unknown>, user: IUserForPermission): Promise<boolean> {
    // Effect is 'allow', so returning false blocks. This denies banned users.
    return user.isActive && !user.isBanned;
  }

  private async handleOwnerMatch(
    cfg: Record<string, unknown>,
    user: IUserForPermission,
    resource?: Document,
  ): Promise<boolean> {
    if (!resource) return false;
    const ownerField = cfg['ownerField'] as string | undefined ?? 'submittedBy';
    const ownerId = (resource as unknown as Record<string, unknown>)[ownerField];
    if (!ownerId) return false;
    return ownerId.toString() === user._id.toString();
  }

  private async handleUniqueReview(
    cfg: Record<string, unknown>,
    user: IUserForPermission,
    resource?: Document,
  ): Promise<boolean> {
    // Used as a 'deny' policy — returns true (trigger deny) if user already reviewed
    if (!resource) return false;
    const stationId = (resource as unknown as Record<string, unknown>)['_id'];
    if (!stationId) return false;

    const existing = await Review.findOne({
      station: stationId,
      author: user._id,
      isActive: true,
    }).lean();

    return !!existing; // true = condition met → deny fires
  }

  private async handleOwnershipCheck(
    cfg: Record<string, unknown>,
    user: IUserForPermission,
    resource?: Document,
  ): Promise<boolean> {
    if (!resource) return false;
    const ownerField = cfg['ownerField'] as string | undefined ?? 'submittedBy';
    const mustNotMatch = cfg['mustNotMatch'] as boolean | undefined ?? false;

    const ownerId = (resource as unknown as Record<string, unknown>)[ownerField];
    if (!ownerId) return false;

    const isOwner = ownerId.toString() === user._id.toString();
    return mustNotMatch ? isOwner : !isOwner;
  }

  private async handleNoSelfVote(
    _cfg: Record<string, unknown>,
    user: IUserForPermission,
    resource?: Document,
  ): Promise<boolean> {
    // Used as 'deny' — returns true (trigger deny) if user authored the review
    if (!resource) return false;
    const authorId = (resource as unknown as Record<string, unknown>)['author'];
    if (!authorId) return false;
    return authorId.toString() === user._id.toString();
  }

  private async handleTimeWindow(
    cfg: Record<string, unknown>,
    _user: IUserForPermission,
    resource?: Document,
  ): Promise<boolean> {
    if (!resource) return false;
    const hours = (cfg['hours'] as number | undefined) ?? 48;
    const createdAt = (resource as unknown as Record<string, unknown>)['createdAt'];
    if (!createdAt) return false;

    const ageMs = Date.now() - new Date(createdAt as Date).getTime();
    return ageMs <= hours * 60 * 60 * 1000;
  }

  private async handleRoleMinimum(
    cfg: Record<string, unknown>,
    user: IUserForPermission,
  ): Promise<boolean> {
    const minLevel = (cfg['minLevel'] as number | undefined) ?? 0;
    // Used as 'deny' for admin_protection — condition is met (deny fires) if user level >= minLevel
    return user.roleLevel >= minLevel;
  }

  private async handleFieldEquals(
    cfg: Record<string, unknown>,
    _user: IUserForPermission,
    resource?: Document,
  ): Promise<boolean> {
    if (!resource) return false;
    const field = cfg['field'] as string | undefined;
    const value = cfg['value'];
    if (!field) return false;

    const resourceValue = (resource as unknown as Record<string, unknown>)[field];
    return resourceValue === value;
  }

  /**
   * Flush the permission cache.
   * Must be called after ANY mutation to: roles, permissions, policies,
   * role_permissions, or user_permission_overrides.
   */
  flush(userId?: string): void {
    if (userId) {
      // Flush only this user's override cache entries
      const keys = this.cache.keys().filter(k => k.startsWith(`user_override:${userId}:`));
      this.cache.del(keys);
      logger.debug(`PermissionEngine: flushed cache for user ${userId} (${keys.length} entries)`);
    } else {
      // Full flush — e.g., after role or permission change
      this.cache.flushAll();
      logger.debug('PermissionEngine: flushed entire permission cache');
    }
  }

  flushAll(): void {
    this.flush();
  }
}

export default PermissionEngine;

