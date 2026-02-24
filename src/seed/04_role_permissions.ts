/**
 * Seeder 04 — role_permissions
 *
 * Owner: Member 4
 * Links permissions (and their policies) to roles.
 *
 * Ref: PROJECT_OVERVIEW.md → Database → role_permissions collection
 *
 * Depends on: 01_permissions, 02_policies, 03_roles
 * Data is additive (upsert by { role, permission }) — safe to re-run.
 */

import { ClientSession } from 'mongoose';
import { Role }           from '@modules/permissions/role.model';
import { Permission }     from '@modules/permissions/permission.model';
import { Policy }         from '@modules/permissions/policy.model';
import { RolePermission } from '@modules/permissions/role_permission.model';
import logger from '@utils/logger';
import type { PermissionAction } from '@/types';

// ─── Role → permissions → policies matrix ────────────────────────────────────
// Format: [roleName, permissionAction, policySlugs[]]
// Ref: PROJECT_OVERVIEW.md → Roles table + API Endpoint auth column
type RolePermEntry = [string, PermissionAction, string[]];

const GUEST_PERMS: RolePermEntry[] = [
  ['guest', 'stations.read',    []],
  ['guest', 'reviews.read',     []],
  ['guest', 'weather.read',     []],
  ['guest', 'users.read-public', []],
];

const USER_BASE_PERMS: RolePermEntry[] = [
  ...GUEST_PERMS.map(([, a, p]) => ['user', a, p] as RolePermEntry),
  ['user', 'stations.create',          ['email_verified_only', 'active_account_only', 'not_banned']],
  ['user', 'reviews.create',           ['email_verified_only', 'active_account_only', 'not_banned', 'one_review_per_station', 'not_own_station']],
  ['user', 'reviews.edit-own',         ['owner_match_review', 'review_time_window']],
  ['user', 'reviews.delete-own',       ['owner_match_review']],
  ['user', 'reviews.helpful',          ['no_self_vote']],
  ['user', 'reviews.flag',             []],
  ['user', 'users.read-own',           ['owner_match_user']],
  ['user', 'users.edit-own',           ['owner_match_user']],
  ['user', 'notifications.read-own',   ['owner_match_notification']],
];

const STATION_OWNER_PERMS: RolePermEntry[] = [
  ...USER_BASE_PERMS.map(([, a, p]) => ['station_owner', a, p] as RolePermEntry),
  ['station_owner', 'stations.edit-own',        ['owner_match_station']],
  ['station_owner', 'stations.delete-own',      ['owner_match_station']],
  ['station_owner', 'stations.view-stats-own',  ['owner_match_station']],
  ['station_owner', 'stations.feature-request', ['owner_match_station']],
];

const ROLE_PERM_MATRIX: RolePermEntry[] = [
  ...GUEST_PERMS,
  ...USER_BASE_PERMS,
  ...STATION_OWNER_PERMS,
  // featured_contributor: same as station_owner
  ...STATION_OWNER_PERMS.map(([, a, p]) => ['featured_contributor', a, p] as RolePermEntry),
  // trusted_reviewer: same as user
  ...USER_BASE_PERMS.map(([, a, p]) => ['trusted_reviewer', a, p] as RolePermEntry),
  // review_moderator: user + review moderation
  ...USER_BASE_PERMS.map(([, a, p]) => ['review_moderator', a, p] as RolePermEntry),
  ['review_moderator', 'reviews.read-flagged', []],
  ['review_moderator', 'reviews.delete-any',   []],
  ['review_moderator', 'reviews.moderate',     []],
  // weather_analyst: user + weather admin
  ...USER_BASE_PERMS.map(([, a, p]) => ['weather_analyst', a, p] as RolePermEntry),
  ['weather_analyst', 'weather.admin',        []],
  ['weather_analyst', 'weather.bulk-refresh', []],
  ['weather_analyst', 'weather.export',       []],
  // permission_auditor: user + audit/quota read
  ...USER_BASE_PERMS.map(([, a, p]) => ['permission_auditor', a, p] as RolePermEntry),
  ['permission_auditor', 'permissions.read', []],
  ['permission_auditor', 'audit.read',       []],
  ['permission_auditor', 'quotas.read',      []],
  // moderator: full management (no policies — moderators are trusted)
  ['moderator', 'stations.read',         []], ['moderator', 'stations.read-pending', []],
  ['moderator', 'stations.create',       ['email_verified_only', 'active_account_only']],
  ['moderator', 'stations.edit-own',     ['owner_match_station']], ['moderator', 'stations.delete-own', ['owner_match_station']],
  ['moderator', 'stations.edit-any',     []], ['moderator', 'stations.delete-any',   []],
  ['moderator', 'stations.approve',      []], ['moderator', 'stations.reject',        []],
  ['moderator', 'stations.feature',      []], ['moderator', 'stations.view-stats-own', ['owner_match_station']],
  ['moderator', 'reviews.read',          []], ['moderator', 'reviews.read-flagged',   []],
  ['moderator', 'reviews.create',        ['email_verified_only', 'one_review_per_station', 'not_own_station']],
  ['moderator', 'reviews.edit-own',      ['owner_match_review']], ['moderator', 'reviews.delete-own', ['owner_match_review']],
  ['moderator', 'reviews.delete-any',    []], ['moderator', 'reviews.moderate', []],
  ['moderator', 'reviews.helpful',       ['no_self_vote']], ['moderator', 'reviews.flag', []],
  ['moderator', 'weather.read',          []], ['moderator', 'weather.admin', []], ['moderator', 'weather.bulk-refresh', []], ['moderator', 'weather.export', []],
  ['moderator', 'users.read-public',     []], ['moderator', 'users.read-own', ['owner_match_user']],
  ['moderator', 'users.edit-own',        ['owner_match_user']], ['moderator', 'users.read-list', []], ['moderator', 'users.manage', []],
  ['moderator', 'permissions.read',      []], ['moderator', 'audit.read', []], ['moderator', 'quotas.read', []],
  ['moderator', 'notifications.read-own', ['owner_match_notification']],
  // admin: all permissions (engine already bypasses policies for roleLevel >= 4)
  ['admin', 'stations.read', []], ['admin', 'stations.read-pending', []], ['admin', 'stations.create', []],
  ['admin', 'stations.edit-own', []], ['admin', 'stations.delete-own', []], ['admin', 'stations.edit-any', []], ['admin', 'stations.delete-any', []],
  ['admin', 'stations.approve', []], ['admin', 'stations.reject', []], ['admin', 'stations.feature', []], ['admin', 'stations.feature-request', []], ['admin', 'stations.view-stats-own', []],
  ['admin', 'reviews.read', []], ['admin', 'reviews.read-flagged', []], ['admin', 'reviews.create', []],
  ['admin', 'reviews.edit-own', []], ['admin', 'reviews.delete-own', []], ['admin', 'reviews.delete-any', []], ['admin', 'reviews.helpful', []], ['admin', 'reviews.flag', []], ['admin', 'reviews.moderate', []],
  ['admin', 'weather.read', []], ['admin', 'weather.admin', []], ['admin', 'weather.bulk-refresh', []], ['admin', 'weather.export', []],
  ['admin', 'users.read-public', []], ['admin', 'users.read-own', []], ['admin', 'users.edit-own', []], ['admin', 'users.read-list', []], ['admin', 'users.manage', []],
  ['admin', 'permissions.read', []], ['admin', 'permissions.manage', []], ['admin', 'quotas.read', []], ['admin', 'audit.read', []], ['admin', 'notifications.read-own', []],
];

export async function seedRolePermissions(session: ClientSession): Promise<void> {
  // Load lookup maps
  const roles       = await Role.find().lean();
  const permissions = await Permission.find().lean();
  const policies    = await Policy.find().lean();

  const roleMap = new Map(roles.map(r => [r.name as string, r._id]));
  const permMap = new Map(permissions.map(p => [p.action, p._id]));
  const polMap  = new Map(policies.map(p => [p.slug, p._id]));

  const ops = ROLE_PERM_MATRIX.map(([roleName, action, policySlugs]) => {
    const roleId  = roleMap.get(roleName);
    const permId  = permMap.get(action);
    const polIds  = policySlugs.map(s => polMap.get(s)).filter(Boolean);

    if (!roleId || !permId) {
      logger.warn(`⚠️  seedRolePermissions: missing role="${roleName}" or permission="${action}" — skipping`);
      return null;
    }
    return {
      updateOne: {
        filter: { role: roleId, permission: permId },
        update: { $set: { role: roleId, permission: permId, policies: polIds } },
        upsert: true,
      },
    };
  }).filter(Boolean) as Parameters<typeof RolePermission.bulkWrite>[0];

  await RolePermission.bulkWrite(ops, { session } as Parameters<typeof RolePermission.bulkWrite>[1]);
  logger.info(`✅  role_permissions seeded (${ops.length})`);
}
