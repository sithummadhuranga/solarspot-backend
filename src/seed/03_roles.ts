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
import logger from '@utils/logger';

// TODO: Member 4 — import Role model when implemented
// import { Role } from '@modules/permissions/role.model';

interface RoleSeed {
  name: RoleSlug;
  displayName: string;
  roleLevel: number;
  isSystem: boolean;
}

// ─── Seed data — 10 roles ────────────────────────────────────────────────────
// Ref: PROJECT_OVERVIEW.md → Roles
export const ROLES_SEED: RoleSeed[] = [
  { name: 'guest',                displayName: 'Visitor',              roleLevel: 0, isSystem: true  },
  { name: 'user',                 displayName: 'Member',               roleLevel: 1, isSystem: true  },
  { name: 'station_owner',        displayName: 'Station Owner',        roleLevel: 2, isSystem: false },
  { name: 'featured_contributor', displayName: 'Featured Contributor', roleLevel: 2, isSystem: false },
  { name: 'trusted_reviewer',     displayName: 'Trusted Reviewer',     roleLevel: 2, isSystem: false },
  { name: 'review_moderator',     displayName: 'Review Moderator',     roleLevel: 3, isSystem: false },
  { name: 'weather_analyst',      displayName: 'Weather Analyst',      roleLevel: 3, isSystem: false },
  { name: 'permission_auditor',   displayName: 'Permission Auditor',   roleLevel: 3, isSystem: false },
  { name: 'moderator',            displayName: 'Moderator',            roleLevel: 3, isSystem: true  },
  { name: 'admin',                displayName: 'Administrator',        roleLevel: 4, isSystem: true  },
];

export async function seedRoles(session: ClientSession): Promise<void> {
  // TODO: Member 4 — upsert all 10 roles using ROLES_SEED above
  // Use { name } as the filter key for upsert (idempotent re-runs)
  logger.warn('seedRoles: not yet implemented');
}
