/**
 * Seeder 03 — roles
 *
 * Owner: Member 4
 * Seeds all 10 role documents.
 *
 * Ref: PROJECT_OVERVIEW.md → Roles — 10 Total
 *
 * Depends on: none (roles are standalone documents)
 * Data is additive (upsert by name) — safe to re-run.
 */

import { ClientSession } from 'mongoose';
import { RoleSlug } from '@/types';
import { Role } from '@modules/permissions/role.model';
import logger from '@utils/logger';

interface RoleSeed {
  name: RoleSlug;
  displayName: string;
  roleLevel: number;
  isSystem: boolean;
  isActive: boolean;
}

// ─── Seed data — 10 roles ────────────────────────────────────────────────────
// Ref: PROJECT_OVERVIEW.md → Roles
export const ROLES_SEED: RoleSeed[] = [
  { name: 'guest',                displayName: 'Visitor',              roleLevel: 0, isSystem: true,  isActive: true },
  { name: 'user',                 displayName: 'Member',               roleLevel: 1, isSystem: true,  isActive: true },
  { name: 'station_owner',        displayName: 'Station Owner',        roleLevel: 2, isSystem: false, isActive: true },
  { name: 'featured_contributor', displayName: 'Featured Contributor', roleLevel: 2, isSystem: false, isActive: true },
  { name: 'trusted_reviewer',     displayName: 'Trusted Reviewer',     roleLevel: 2, isSystem: false, isActive: true },
  { name: 'review_moderator',     displayName: 'Review Moderator',     roleLevel: 3, isSystem: false, isActive: true },
  { name: 'weather_analyst',      displayName: 'Weather Analyst',      roleLevel: 3, isSystem: false, isActive: true },
  { name: 'permission_auditor',   displayName: 'Permission Auditor',   roleLevel: 3, isSystem: false, isActive: true },
  { name: 'moderator',            displayName: 'Moderator',            roleLevel: 3, isSystem: true,  isActive: true },
  { name: 'admin',                displayName: 'Administrator',        roleLevel: 4, isSystem: true,  isActive: true },
];

export async function seedRoles(session: ClientSession): Promise<void> {
  const ops = ROLES_SEED.map(r => ({
    updateOne: {
      filter: { name: r.name },
      update: { $set: r },
      upsert: true,
    },
  }));
  await Role.bulkWrite(ops, { session } as Parameters<typeof Role.bulkWrite>[1]);
  logger.info(`✅  roles seeded (${ROLES_SEED.length})`);
}
