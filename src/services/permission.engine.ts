

import { Document, Types } from 'mongoose';
import NodeCache from 'node-cache';
import { RolePermission } from '@modules/permissions/role_permission.model';
import { UserPermissionOverride } from '@modules/permissions/user_permission_override.model';
import { Review } from '@modules/reviews/review.model';
import logger from '@utils/logger';
import { IUserForPermission, EvaluationResult, PermissionAction, PolicyCondition, IPolicy } from '@/types';

type ConditionHandler = (
  config: Record<string, unknown>,
  user: IUserForPermission,
  resource?: Document,
) => Promise<boolean>;

const CACHE_TTL_SECONDS = 300; // 5 minutes

export class PermissionEngine {
  private readonly cache = new NodeCache({ stdTTL: CACHE_TTL_SECONDS, useClones: false });

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

  
  async evaluate(
    user: IUserForPermission,
    action: PermissionAction,
    resource?: Document,
  ): Promise<EvaluationResult> {
    if (user.roleLevel >= 4) {
      return { allowed: true, reason: 'Admin bypass' };
    }

    try {
      const rolePermissions = await this.getRolePermissions(user.role);

      const rolePermission = rolePermissions.find(
        (rp: { permission: { action: string }; policies: IPolicy[] }) =>
          rp.permission?.action === action,
      );

      if (!rolePermission) {
        const override = await this.getUserOverride(user._id, action);
        if (override?.effect === 'grant') {
          return { allowed: true, reason: 'User override: grant' };
        }
        return { allowed: false, reason: `Role does not have permission: ${action}` };
      }

      const override = await this.getUserOverride(user._id, action);
      if (override) {
        if (override.effect === 'deny') {
          return { allowed: false, reason: 'User override: deny' };
        }
        if (override.effect === 'grant') {
          return { allowed: true, reason: 'User override: grant' };
        }
      }

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


  private async handleEmailVerified(_cfg: Record<string, unknown>, user: IUserForPermission): Promise<boolean> {
    return user.isEmailVerified;
  }

  private async handleAccountActive(_cfg: Record<string, unknown>, user: IUserForPermission): Promise<boolean> {
    return user.isActive;
  }

  private async handleCheckBanned(_cfg: Record<string, unknown>, user: IUserForPermission): Promise<boolean> {
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

  
  flush(userId?: string): void {
    if (userId) {
      const keys = this.cache.keys().filter(k => k.startsWith(`user_override:${userId}:`));
      this.cache.del(keys);
      logger.debug(`PermissionEngine: flushed cache for user ${userId} (${keys.length} entries)`);
    } else {
      this.cache.flushAll();
      logger.debug('PermissionEngine: flushed entire permission cache');
    }
  }

  flushAll(): void {
    this.flush();
  }
}

export default PermissionEngine;

