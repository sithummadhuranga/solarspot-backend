import Policy from '@modules/permissions/models/policy.model';
import logger from '@utils/logger';

/**
 * All 13 built-in policies as defined in PROJECT_OVERVIEW.md
 */
const POLICIES = [
  {
    name: 'email_verified_only',
    displayName: 'Email Verified Only',
    description: 'User must have verified their email address',
    condition: 'email_verified' as const,
    effect: 'allow' as const,
    config: {},
    isBuiltIn: true,
  },
  {
    name: 'active_account_only',
    displayName: 'Active Account Only',
    description: 'User account must be active (not banned or deleted)',
    condition: 'account_active' as const,
    effect: 'allow' as const,
    config: {},
    isBuiltIn: true,
  },
  {
    name: 'not_banned',
    displayName: 'Not Banned',
    description: 'User must not be banned',
    condition: 'account_active' as const,
    effect: 'allow' as const,
    config: {},
    isBuiltIn: true,
  },
  {
    name: 'owner_match_station',
    displayName: 'Owner Match (Station)',
    description: 'User must be the station submitter',
    condition: 'owner_match' as const,
    effect: 'allow' as const,
    config: { ownerField: 'submittedBy' },
    isBuiltIn: true,
  },
  {
    name: 'owner_match_review',
    displayName: 'Owner Match (Review)',
    description: 'User must be the review author',
    condition: 'owner_match' as const,
    effect: 'allow' as const,
    config: { ownerField: 'author' },
    isBuiltIn: true,
  },
  {
    name: 'owner_match_user',
    displayName: 'Owner Match (User)',
    description: 'User must be editing their own profile',
    condition: 'owner_match' as const,
    effect: 'allow' as const,
    config: { ownerField: '_id' },
    isBuiltIn: true,
  },
  {
    name: 'owner_match_notification',
    displayName: 'Owner Match (Notification)',
    description: 'User must be the notification recipient',
    condition: 'owner_match' as const,
    effect: 'allow' as const,
    config: { ownerField: 'recipient' },
    isBuiltIn: true,
  },
  {
    name: 'one_review_per_station',
    displayName: 'One Review Per Station',
    description: 'User can only submit one review per station',
    condition: 'unique_review' as const,
    effect: 'deny' as const,
    config: {},
    isBuiltIn: true,
  },
  {
    name: 'not_own_station',
    displayName: 'Not Own Station',
    description: 'User cannot review their own station',
    condition: 'ownership_check' as const,
    effect: 'deny' as const,
    config: { ownerField: 'submittedBy', mustNotMatch: true },
    isBuiltIn: true,
  },
  {
    name: 'no_self_vote',
    displayName: 'No Self Vote',
    description: 'User cannot mark their own review as helpful',
    condition: 'no_self_vote' as const,
    effect: 'deny' as const,
    config: { ownerField: 'author' },
    isBuiltIn: true,
  },
  {
    name: 'review_time_window',
    displayName: 'Review Time Window',
    description: 'Reviews can only be edited within 48 hours of creation',
    condition: 'time_window' as const,
    effect: 'allow' as const,
    config: { hours: 48 },
    isBuiltIn: true,
  },
  {
    name: 'admin_protection',
    displayName: 'Admin Protection',
    description: 'Prevents non-admins from managing admin accounts',
    condition: 'role_minimum' as const,
    effect: 'deny' as const,
    config: { minLevel: 4 },
    isBuiltIn: true,
  },
  {
    name: 'station_approved',
    displayName: 'Station Approved',
    description: 'Station must be approved before certain actions',
    condition: 'field_equals' as const,
    effect: 'allow' as const,
    config: { field: 'status', value: 'approved' },
    isBuiltIn: true,
  },
];

/**
 * Seeder 02 — Policies
 * Seeds all 13 built-in policy documents.
 */
export async function seed02Policies(): Promise<void> {
  logger.info('[Seeder 02] Running: Policies');

  const existingCount = await Policy.countDocuments();

  if (existingCount > 0) {
    logger.info(`[Seeder 02] ${existingCount} policies already exist, skipping`);
    return;
  }

  await Policy.insertMany(POLICIES);
  logger.info(`[Seeder 02] Inserted ${POLICIES.length} policies`);
}
