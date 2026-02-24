import Role from '@modules/permissions/models/role.model';
import logger from '@utils/logger';

/**
 * All 10 roles as defined in PROJECT_OVERVIEW.md
 */
const ROLES = [
  {
    name: 'guest',
    displayName: 'Visitor',
    description: 'Unauthenticated visitor (public access only)',
    roleLevel: 0,
    isSystem: true,
    component: 'auth',
  },
  {
    name: 'user',
    displayName: 'Member',
    description: 'Registered user with basic permissions',
    roleLevel: 1,
    isSystem: true,
    component: 'auth',
  },
  {
    name: 'station_owner',
    displayName: 'Station Owner',
    description: 'User who has submitted multiple verified stations',
    roleLevel: 2,
    isSystem: false,
    component: 'stations',
  },
  {
    name: 'featured_contributor',
    displayName: 'Featured Contributor',
    description: 'User with high-quality station submissions',
    roleLevel: 2,
    isSystem: false,
    component: 'stations',
  },
  {
    name: 'trusted_reviewer',
    displayName: 'Trusted Reviewer',
    description: 'User whose reviews are highly rated',
    roleLevel: 2,
    isSystem: false,
    component: 'reviews',
  },
  {
    name: 'review_moderator',
    displayName: 'Review Moderator',
    description: 'Can moderate flagged reviews and comments',
    roleLevel: 3,
    isSystem: false,
    component: 'reviews',
  },
  {
    name: 'weather_analyst',
    displayName: 'Weather Analyst',
    description: 'Can bulk-refresh weather data and export analytics',
    roleLevel: 3,
    isSystem: false,
    component: 'weather',
  },
  {
    name: 'permission_auditor',
    displayName: 'Permission Auditor',
    description: 'Can view permissions and audit logs',
    roleLevel: 3,
    isSystem: false,
    component: 'permissions',
  },
  {
    name: 'moderator',
    displayName: 'Moderator',
    description: 'Can approve/reject stations and moderate content',
    roleLevel: 3,
    isSystem: true,
    component: 'auth',
  },
  {
    name: 'admin',
    displayName: 'Administrator',
    description: 'Full system access (bypasses all permission checks)',
    roleLevel: 4,
    isSystem: true,
    component: 'auth',
  },
];

/**
 * Seeder 03 — Roles
 * Seeds all 10 role documents.
 */
export async function seed03Roles(): Promise<void> {
  logger.info('[Seeder 03] Running: Roles');

  const existingCount = await Role.countDocuments();

  if (existingCount > 0) {
    logger.info(`[Seeder 03] ${existingCount} roles already exist, skipping`);
    return;
  }

  await Role.insertMany(ROLES);
  logger.info(`[Seeder 03] Inserted ${ROLES.length} roles`);
}
