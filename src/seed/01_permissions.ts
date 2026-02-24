/**
 * Seeder 01 — permissions
 *
 * Owner: Member 4
 * Seeds all 35 permission action documents.
 *
 * Ref: PROJECT_OVERVIEW.md → Permissions — 35 Actions
 *
 * Data is additive (upsert by action slug) — safe to re-run.
 */

import { ClientSession } from 'mongoose';
import { PermissionAction } from '@/types';
import { Permission } from '@modules/permissions/permission.model';
import logger from '@utils/logger';

interface PermissionSeed {
  action: PermissionAction;
  resource: string;
  component: string;
  description: string;
}

// ─── Seed data — 35 permissions ─────────────────────────────────────────────
// Ref: PROJECT_OVERVIEW.md → Permissions — 35 Actions
export const PERMISSIONS_SEED: PermissionSeed[] = [
  // Stations (Member 1)
  { action: 'stations.read',           resource: 'stations', component: 'stations', description: 'Read approved stations' },
  { action: 'stations.read-pending',   resource: 'stations', component: 'stations', description: 'Read pending stations (admin/mod)' },
  { action: 'stations.create',         resource: 'stations', component: 'stations', description: 'Submit a new station' },
  { action: 'stations.edit-own',       resource: 'stations', component: 'stations', description: 'Edit own station' },
  { action: 'stations.delete-own',     resource: 'stations', component: 'stations', description: 'Delete own station' },
  { action: 'stations.edit-any',       resource: 'stations', component: 'stations', description: 'Edit any station (admin/mod)' },
  { action: 'stations.delete-any',     resource: 'stations', component: 'stations', description: 'Delete any station (admin/mod)' },
  { action: 'stations.approve',        resource: 'stations', component: 'stations', description: 'Approve a pending station' },
  { action: 'stations.reject',         resource: 'stations', component: 'stations', description: 'Reject a pending station' },
  { action: 'stations.feature',        resource: 'stations', component: 'stations', description: 'Feature/unfeature a station' },
  { action: 'stations.feature-request',resource: 'stations', component: 'stations', description: 'Request to feature own station' },
  { action: 'stations.view-stats-own', resource: 'stations', component: 'stations', description: 'View stats for own station' },
  // Reviews (Member 2)
  { action: 'reviews.read',            resource: 'reviews',  component: 'reviews',  description: 'Read approved reviews' },
  { action: 'reviews.read-flagged',    resource: 'reviews',  component: 'reviews',  description: 'Read flagged reviews (mod)' },
  { action: 'reviews.create',          resource: 'reviews',  component: 'reviews',  description: 'Submit a review' },
  { action: 'reviews.edit-own',        resource: 'reviews',  component: 'reviews',  description: 'Edit own review' },
  { action: 'reviews.delete-own',      resource: 'reviews',  component: 'reviews',  description: 'Delete own review' },
  { action: 'reviews.delete-any',      resource: 'reviews',  component: 'reviews',  description: 'Delete any review (mod)' },
  { action: 'reviews.helpful',         resource: 'reviews',  component: 'reviews',  description: 'Mark a review as helpful' },
  { action: 'reviews.flag',            resource: 'reviews',  component: 'reviews',  description: 'Flag a review for moderation' },
  { action: 'reviews.moderate',        resource: 'reviews',  component: 'reviews',  description: 'Moderate a flagged review' },
  // Weather (Member 3)
  { action: 'weather.read',            resource: 'weather',  component: 'weather',  description: 'Read weather data' },
  { action: 'weather.admin',           resource: 'weather',  component: 'weather',  description: 'Admin weather operations' },
  { action: 'weather.bulk-refresh',    resource: 'weather',  component: 'weather',  description: 'Trigger bulk weather refresh' },
  { action: 'weather.export',          resource: 'weather',  component: 'weather',  description: 'Export weather data' },
  // Users & Auth (Member 4)
  { action: 'users.read-public',       resource: 'users',    component: 'users',    description: 'Read public user profile' },
  { action: 'users.read-own',          resource: 'users',    component: 'users',    description: 'Read own full profile' },
  { action: 'users.edit-own',          resource: 'users',    component: 'users',    description: 'Edit own profile' },
  { action: 'users.read-list',         resource: 'users',    component: 'users',    description: 'List all users (admin)' },
  { action: 'users.manage',            resource: 'users',    component: 'users',    description: 'Manage any user (admin)' },
  // System (Member 4)
  { action: 'permissions.read',        resource: 'permissions', component: 'permissions', description: 'Read permission configuration' },
  { action: 'permissions.manage',      resource: 'permissions', component: 'permissions', description: 'Manage permission configuration' },
  { action: 'quotas.read',             resource: 'system',      component: 'permissions', description: 'View API quota stats' },
  { action: 'audit.read',              resource: 'system',      component: 'permissions', description: 'Read audit logs' },
  { action: 'notifications.read-own',  resource: 'notifications', component: 'permissions', description: 'Read own notifications' },
];

export async function seedPermissions(session: ClientSession): Promise<void> {
  const ops = PERMISSIONS_SEED.map(p => ({
    updateOne: {
      filter: { action: p.action },
      update: { $set: p },
      upsert: true,
    },
  }));
  await Permission.bulkWrite(ops, { session } as Parameters<typeof Permission.bulkWrite>[1]);
  logger.info(`✅  permissions seeded (${PERMISSIONS_SEED.length})`);
}
