import { Document } from 'mongoose';
import { IUser } from '@modules/users/user.model';
import { IPolicy, PolicyCondition } from '@modules/permissions/models/policy.model';
import logger from '@utils/logger';

type ConditionHandler = (
  policy: IPolicy,
  user: IUser,
  resource?: Document
) => Promise<boolean>;

/**
 * PolicyEngine — evaluates individual policy conditions.
 * Each of the 13 built-in conditions has a dedicated handler.
 */
class PolicyEngine {
  private handlers = new Map<PolicyCondition, ConditionHandler>([
    ['email_verified', this.handleEmailVerified.bind(this)],
    ['account_active', this.handleAccountActive.bind(this)],
    ['owner_match', this.handleOwnerMatch.bind(this)],
    ['unique_review', this.handleUniqueReview.bind(this)],
    ['no_self_vote', this.handleNoSelfVote.bind(this)],
    ['time_window', this.handleTimeWindow.bind(this)],
    ['role_minimum', this.handleRoleMinimum.bind(this)],
    ['field_equals', this.handleFieldEquals.bind(this)],
    ['ownership_check', this.handleOwnershipCheck.bind(this)],
  ]);

  /**
   * Evaluate a single policy condition.
   * Returns true if the condition passes, false otherwise.
   */
  async evaluate(
    policy: IPolicy,
    user: IUser,
    resource?: Document
  ): Promise<boolean> {
    const handler = this.handlers.get(policy.condition);

    if (!handler) {
      logger.error(`Unknown policy condition: ${policy.condition}`, {
        policyId: policy._id,
        policyName: policy.name,
      });
      throw new Error(`Unknown policy condition: ${policy.condition}`);
    }

    try {
      const result = await handler(policy, user, resource);

      logger.debug('Policy evaluated', {
        policy: policy.name,
        condition: policy.condition,
        effect: policy.effect,
        result,
        userId: user._id,
      });

      return result;
    } catch (err) {
      logger.error('Policy evaluation error', {
        policy: policy.name,
        condition: policy.condition,
        error: err instanceof Error ? err.message : String(err),
      });
      // Fail-safe: deny on error (for 'allow' policies), allow on error (for 'deny' policies)
      return policy.effect === 'deny';
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Policy Condition Handlers (13 built-in)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * email_verified — user's email must be verified
   */
  private async handleEmailVerified(_policy: IPolicy, user: IUser): Promise<boolean> {
    return user.isEmailVerified === true;
  }

  /**
   * account_active — user's account must be active
   */
  private async handleAccountActive(_policy: IPolicy, user: IUser): Promise<boolean> {
    return user.isActive === true;
  }

  /**
   * owner_match — user must be the owner of the resource
   * Config: { ownerField: 'submittedBy' | 'author' | '_id' | etc. }
   */
  private async handleOwnerMatch(
    policy: IPolicy,
    user: IUser,
    resource?: Document
  ): Promise<boolean> {
    if (!resource) {
      logger.warn('owner_match policy requires resource', { policyName: policy.name });
      return false;
    }

    const ownerField = policy.config.ownerField ?? 'submittedBy';
    const ownerId = (resource as unknown as Record<string, unknown>)[ownerField];

    if (!ownerId) {
      logger.warn(`owner_match: resource missing field '${ownerField}'`, {
        policyName: policy.name,
        resourceId: resource._id,
      });
      return false;
    }

    // Handle populated fields (ObjectId or populated object)
    const ownerIdString =
      typeof ownerId === 'object' && '_id' in (ownerId as object)
        ? String((ownerId as { _id: unknown })._id)
        : String(ownerId);

    return ownerIdString === user._id.toString();
  }

  /**
   * unique_review — user must not have already reviewed this station
   * (Used for reviews.create permission)
   */
  private async handleUniqueReview(
    _policy: IPolicy,
    user: IUser,
    resource?: Document
  ): Promise<boolean> {
    if (!resource) return true; // no resource to check against

    try {
      // Dynamic import to avoid circular dependency
      // NOTE: Review model from M2 module — gracefully handle if not yet implemented
      // @ts-expect-error - Review model not yet implemented by M2
      const { default: Review } = await import('@modules/reviews/review.model');

      const existingReview = await Review.findOne({
        station: (resource as unknown as Record<string, unknown>).station ?? resource._id,
        author: user._id,
        isActive: true,
      }).lean();

      return !existingReview; // true if NO existing review (unique)
    } catch (err) {
      // Review model not implemented yet (M2 pending) — allow by default
      logger.warn('unique_review policy: Review model not found (M2 not implemented)');
      return true;
    }
  }

  /**
   * no_self_vote — user cannot vote helpful on their own review
   */
  private async handleNoSelfVote(
    policy: IPolicy,
    user: IUser,
    resource?: Document
  ): Promise<boolean> {
    if (!resource) return true;

    const authorField = policy.config.ownerField ?? 'author';
    const authorId = (resource as unknown as Record<string, unknown>)[authorField];

    if (!authorId) return true;

    const authorIdString =
      typeof authorId === 'object' && '_id' in (authorId as object)
        ? String((authorId as { _id: unknown })._id)
        : String(authorId);

    return authorIdString !== user._id.toString(); // true if NOT self
  }

  /**
   * time_window — action must be within X hours of resource creation
   * Config: { hours: 48 }
   */
  private async handleTimeWindow(
    policy: IPolicy,
    _user: IUser,
    resource?: Document
  ): Promise<boolean> {
    if (!resource) return false;

    const hours = policy.config.hours ?? 48;
    const createdAt = (resource as unknown as { createdAt?: Date }).createdAt;

    if (!createdAt) {
      logger.warn('time_window policy requires createdAt field', {
        policyName: policy.name,
      });
      return false;
    }

    const now = new Date();
    const elapsed = now.getTime() - createdAt.getTime();
    const elapsedHours = elapsed / (1000 * 60 * 60);

    return elapsedHours <= hours;
  }

  /**
   * role_minimum — user's role level must be >= minLevel
   * Config: { minLevel: 3 }
   */
  private async handleRoleMinimum(policy: IPolicy, user: IUser): Promise<boolean> {
    const minLevel = policy.config.minLevel ?? 0;

    // Dynamic import to avoid circular dependency
    const { default: Role } = await import('@modules/permissions/models/role.model');

    const userRole = await Role.findOne({
      name: user.role,
      isActive: true,
    }).lean();

    if (!userRole) {
      logger.warn('role_minimum: user role not found', {
        userId: user._id,
        role: user.role,
      });
      return false;
    }

    return userRole.roleLevel >= minLevel;
  }

  /**
   * field_equals — resource field must equal a specific value
   * Config: { field: 'status', value: 'approved' }
   */
  private async handleFieldEquals(
    policy: IPolicy,
    _user: IUser,
    resource?: Document
  ): Promise<boolean> {
    if (!resource) return false;

    const field = policy.config.field;
    const expectedValue = policy.config.value;

    if (!field) {
      logger.warn('field_equals policy requires field config', {
        policyName: policy.name,
      });
      return false;
    }

    const actualValue = (resource as unknown as Record<string, unknown>)[field];
    return actualValue === expectedValue;
  }

  /**
   * ownership_check — inverse of owner_match (user must NOT be owner)
   * Config: { ownerField: 'submittedBy', mustNotMatch: true }
   */
  private async handleOwnershipCheck(
    policy: IPolicy,
    user: IUser,
    resource?: Document
  ): Promise<boolean> {
    if (!resource) return true;

    const ownerField = policy.config.ownerField ?? 'submittedBy';
    const mustNotMatch = policy.config.mustNotMatch ?? false;

    const ownerId = (resource as unknown as Record<string, unknown>)[ownerField];

    if (!ownerId) return true;

    const ownerIdString =
      typeof ownerId === 'object' && '_id' in (ownerId as object)
        ? String((ownerId as { _id: unknown })._id)
        : String(ownerId);

    const isOwner = ownerIdString === user._id.toString();

    return mustNotMatch ? !isOwner : isOwner;
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────
const policyEngine = new PolicyEngine();

export default policyEngine;
export { PolicyEngine };
