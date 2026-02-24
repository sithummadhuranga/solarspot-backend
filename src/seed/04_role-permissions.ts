import Role from '@modules/permissions/models/role.model';
import Permission from '@modules/permissions/models/permission.model';
import Policy from '@modules/permissions/models/policy.model';
import RolePermission from '@modules/permissions/models/role-permission.model';
import SystemMeta from '@modules/permissions/models/system-meta.model';
import logger from '@utils/logger';

/**
 * Role-Permission mappings with attached policies.
 *
 * Format: [roleSlug, permissionAction, [policyNames]]
 *
 * This is the heart of the PBAC system — defines which roles get which permissions
 * and what policies must be satisfied for each combination.
 */
const ROLE_PERMISSION_MAPPINGS: Array<[string, string, string[]]> = [
  // ───────────────────────────────────────────────────────────────────────
  // GUEST ROLE (level 0) — Public read-only access
  // ───────────────────────────────────────────────────────────────────────
  ['guest', 'stations.read', []],
  ['guest', 'reviews.read', []],
  ['guest', 'weather.read', []],
  ['guest', 'users.read-public', []],

  // ───────────────────────────────────────────────────────────────────────
  // USER ROLE (level 1) — Basic registered user
  // ───────────────────────────────────────────────────────────────────────
  // Inherits guest permissions
  ['user', 'stations.read', []],
  ['user', 'reviews.read', []],
  ['user', 'weather.read', []],
  ['user', 'users.read-public', []],

  // Station permissions
  ['user', 'stations.create', ['email_verified_only', 'active_account_only']],
  ['user', 'stations.edit-own', ['email_verified_only', 'active_account_only', 'owner_match_station']],
  ['user', 'stations.delete-own', ['email_verified_only', 'active_account_only', 'owner_match_station']],
  ['user', 'stations.feature-request', ['email_verified_only', 'active_account_only', 'owner_match_station']],
  ['user', 'stations.view-stats-own', ['email_verified_only', 'active_account_only', 'owner_match_station']],

  // Review permissions
  ['user', 'reviews.create', ['email_verified_only', 'active_account_only', 'not_own_station', 'one_review_per_station']],
  ['user', 'reviews.edit-own', ['email_verified_only', 'active_account_only', 'owner_match_review', 'review_time_window']],
  ['user', 'reviews.delete-own', ['email_verified_only', 'active_account_only', 'owner_match_review']],
  ['user', 'reviews.helpful', ['email_verified_only', 'active_account_only', 'no_self_vote']],
  ['user', 'reviews.flag', ['email_verified_only', 'active_account_only']],

  // User permissions
  ['user', 'users.read-own', ['active_account_only']],
  ['user', 'users.edit-own', ['active_account_only', 'owner_match_user']],
  ['user', 'notifications.read-own', ['active_account_only', 'owner_match_notification']],

  // ───────────────────────────────────────────────────────────────────────
  // STATION_OWNER ROLE (level 2) — Inherits user + bonus stats permission
  // ───────────────────────────────────────────────────────────────────────
  ['station_owner', 'stations.view-stats-own', ['active_account_only', 'owner_match_station']],

  // ───────────────────────────────────────────────────────────────────────
  // TRUSTED_REVIEWER ROLE (level 2) — Reviews auto-approved
  // ───────────────────────────────────────────────────────────────────────
  // (No special permissions — handled in service logic via role check)

  // ───────────────────────────────────────────────────────────────────────
  // REVIEW_MODERATOR ROLE (level 3) — Can moderate flagged content
  // ───────────────────────────────────────────────────────────────────────
  ['review_moderator', 'reviews.read-flagged', ['active_account_only']],
  ['review_moderator', 'reviews.moderate', ['active_account_only']],
  ['review_moderator', 'reviews.delete-any', ['active_account_only']],

  // ───────────────────────────────────────────────────────────────────────
  // WEATHER_ANALYST ROLE (level 3) — Weather admin features
  // ───────────────────────────────────────────────────────────────────────
  ['weather_analyst', 'weather.admin', ['active_account_only']],
  ['weather_analyst', 'weather.bulk-refresh', ['active_account_only']],
  ['weather_analyst', 'weather.export', ['active_account_only']],

  // ───────────────────────────────────────────────────────────────────────
  // PERMISSION_AUDITOR ROLE (level 3) — Can view audit logs
  // ───────────────────────────────────────────────────────────────────────
  ['permission_auditor', 'permissions.read', ['active_account_only']],
  ['permission_auditor', 'audit.read', ['active_account_only']],

  // ───────────────────────────────────────────────────────────────────────
  // MODERATOR ROLE (level 3) — Approve/reject stations + moderate reviews
  // ───────────────────────────────────────────────────────────────────────
  // Inherits all user permissions
  ['moderator', 'stations.read-pending', ['active_account_only']],
  ['moderator', 'stations.approve', ['active_account_only']],
  ['moderator', 'stations.reject', ['active_account_only']],
  ['moderator', 'stations.edit-any', ['active_account_only']],
  ['moderator', 'reviews.read-flagged', ['active_account_only']],
  ['moderator', 'reviews.moderate', ['active_account_only']],
  ['moderator', 'reviews.delete-any', ['active_account_only']],
  ['moderator', 'users.read-list', ['active_account_only']],

  // ───────────────────────────────────────────────────────────────────────
  // ADMIN ROLE (level 4) — Full access (bypasses evaluation in engine)
  // ───────────────────────────────────────────────────────────────────────
  // Admins bypass ALL checks in PermissionEngine Step 3
  // These are listed for documentation only
  ['admin', 'stations.delete-any', []],
  ['admin', 'stations.feature', []],
  ['admin', 'users.manage', []],
  ['admin', 'permissions.manage', []],
  ['admin', 'quotas.read', []],
];

/**
 * Seeder 04 — Role Permissions
 * Seeds role-permission mappings with attached policies.
 * This is the most complex seeder — requires all previous seeders to run first.
 */
export async function seed04RolePermissions(): Promise<void> {
  logger.info('[Seeder 04] Running: Role Permissions');

  const existingCount = await RolePermission.countDocuments();

  if (existingCount > 0) {
    logger.info(`[Seeder 04] ${existingCount} role-permissions already exist, skipping`);
    return;
  }

  // Load all roles, permissions, and policies
  const [roles, permissions, policies] = await Promise.all([
    Role.find().lean(),
    Permission.find().lean(),
    Policy.find().lean(),
  ]);

  const roleMap = new Map(roles.map((r) => [r.name, r]));
  const permissionMap = new Map(permissions.map((p) => [p.action, p]));
  const policyMap = new Map(policies.map((p) => [p.name, p]));

  const rolePermissions = [];

  for (const [roleSlug, permissionAction, policyNames] of ROLE_PERMISSION_MAPPINGS) {
    const role = roleMap.get(roleSlug);
    const permission = permissionMap.get(permissionAction);

    if (!role) {
      logger.warn(`[Seeder 04] Role not found: ${roleSlug}`);
      continue;
    }

    if (!permission) {
      logger.warn(`[Seeder 04] Permission not found: ${permissionAction}`);
      continue;
    }

    // Resolve policy IDs
    const policyIds = policyNames
      .map((name) => {
        const policy = policyMap.get(name);
        if (!policy) {
          logger.warn(`[Seeder 04] Policy not found: ${name}`);
          return null;
        }
        return policy._id;
      })
      .filter((id) => id !== null);

    rolePermissions.push({
      role: role._id,
      permission: permission._id,
      policies: policyIds,
      isActive: true,
    });
  }

  await RolePermission.insertMany(rolePermissions);
  logger.info(`[Seeder 04] Inserted ${rolePermissions.length} role-permission mappings`);

  // Mark core seeding as complete
  await SystemMeta.findOneAndUpdate({}, { seededAt: new Date() });
  logger.info('[Seeder 04] Core seeding complete — SystemMeta updated');
}
