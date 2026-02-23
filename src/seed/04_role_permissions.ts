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
 *
 * After this seeder runs, the permission engine can evaluate
 * any action for any role without DB joins (cached in PermissionEngine).
 */

import { ClientSession } from 'mongoose';
import logger from '@utils/logger';

// TODO: Member 4 — import models when implemented
// import { Role }           from '@modules/permissions/role.model';
// import { Permission }     from '@modules/permissions/permission.model';
// import { Policy }         from '@modules/permissions/policy.model';
// import { RolePermission } from '@modules/permissions/role_permission.model';

export async function seedRolePermissions(session: ClientSession): Promise<void> {
  // TODO: Member 4 — implement the full role → permission → policy matrix
  //
  // Approach:
  // 1. Load all roles, permissions, and policies by slug/action into maps
  // 2. For each (role, permission, policies[]) tuple, upsert a RolePermission doc
  //
  // The full matrix should match PROJECT_OVERVIEW.md → API Endpoints (the Auth column)
  // and the Roles table (which roles have which permissions by default).
  //
  // Example:
  //   user role   → stations.read    (no policies)
  //   user role   → stations.create  (policies: email_verified_only, active_account_only)
  //   admin role  → stations.approve (no policies — admins bypass policy engine)
  logger.warn('seedRolePermissions: not yet implemented');
}
