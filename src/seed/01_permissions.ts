import crypto from 'crypto';
import Permission from '@modules/permissions/models/permission.model';
import SystemMeta from '@modules/permissions/models/system-meta.model';
import logger from '@utils/logger';

/**
 * All 35 permission actions as defined in PROJECT_OVERVIEW.md
 */
const PERMISSIONS = [
  // Stations (12)
  { action: 'stations.read', resource: 'Station', component: 'stations', description: 'View approved active stations' },
  { action: 'stations.read-pending', resource: 'Station', component: 'stations', description: 'View pending moderation stations' },
  { action: 'stations.create', resource: 'Station', component: 'stations', description: 'Submit new station for approval' },
  { action: 'stations.edit-own', resource: 'Station', component: 'stations', description: 'Edit own submitted stations' },
  { action: 'stations.delete-own', resource: 'Station', component: 'stations', description: 'Delete own submitted stations' },
  { action: 'stations.edit-any', resource: 'Station', component: 'stations', description: 'Edit any station (admin)' },
  { action: 'stations.delete-any', resource: 'Station', component: 'stations', description: 'Delete any station (admin)' },
  { action: 'stations.approve', resource: 'Station', component: 'stations', description: 'Approve pending stations' },
  { action: 'stations.reject', resource: 'Station', component: 'stations', description: 'Reject pending stations' },
  { action: 'stations.feature', resource: 'Station', component: 'stations', description: 'Feature a station (admin)' },
  { action: 'stations.feature-request', resource: 'Station', component: 'stations', description: 'Request station to be featured' },
  { action: 'stations.view-stats-own', resource: 'Station', component: 'stations', description: 'View statistics for own stations' },

  // Reviews (9)
  { action: 'reviews.read', resource: 'Review', component: 'reviews', description: 'View approved reviews' },
  { action: 'reviews.read-flagged', resource: 'Review', component: 'reviews', description: 'View flagged reviews' },
  { action: 'reviews.create', resource: 'Review', component: 'reviews', description: 'Create a review for a station' },
  { action: 'reviews.edit-own', resource: 'Review', component: 'reviews', description: 'Edit own reviews' },
  { action: 'reviews.delete-own', resource: 'Review', component: 'reviews', description: 'Delete own reviews' },
  { action: 'reviews.delete-any', resource: 'Review', component: 'reviews', description: 'Delete any review (moderator)' },
  { action: 'reviews.helpful', resource: 'Review', component: 'reviews', description: 'Mark review as helpful' },
  { action: 'reviews.flag', resource: 'Review', component: 'reviews', description: 'Flag a review for moderation' },
  { action: 'reviews.moderate', resource: 'Review', component: 'reviews', description: 'Moderate flagged reviews' },

  // Weather (4)
  { action: 'weather.read', resource: 'Weather', component: 'weather', description: 'View weather data and solar forecasts' },
  { action: 'weather.admin', resource: 'Weather', component: 'weather', description: 'View weather admin features' },
  { action: 'weather.bulk-refresh', resource: 'Weather', component: 'weather', description: 'Bulk refresh weather data' },
  { action: 'weather.export', resource: 'Weather', component: 'weather', description: 'Export weather analytics' },

  // Users & Auth (5)
  { action: 'users.read-public', resource: 'User', component: 'users', description: 'View public user profiles' },
  { action: 'users.read-own', resource: 'User', component: 'users', description: 'View own profile' },
  { action: 'users.edit-own', resource: 'User', component: 'users', description: 'Edit own profile' },
  { action: 'users.read-list', resource: 'User', component: 'users', description: 'List all users (admin)' },
  { action: 'users.manage', resource: 'User', component: 'users', description: 'Manage user accounts (admin)' },

  // System (5)
  { action: 'permissions.read', resource: 'Permission', component: 'permissions', description: 'View permissions and policies' },
  { action: 'permissions.manage', resource: 'Permission', component: 'permissions', description: 'Manage permissions and roles (admin)' },
  { action: 'quotas.read', resource: 'Quota', component: 'system', description: 'View quota dashboard' },
  { action: 'audit.read', resource: 'AuditLog', component: 'system', description: 'View audit logs' },
  { action: 'notifications.read-own', resource: 'Notification', component: 'system', description: 'View own notifications' },
];

/**
 * Seeder 01 — Permissions
 * Seeds all 35 permission actions and computes manifest hash.
 */
export async function seed01Permissions(): Promise<void> {
  logger.info('[Seeder 01] Running: Permissions');

  const existingCount = await Permission.countDocuments();

  if (existingCount > 0) {
    logger.info(`[Seeder 01] ${existingCount} permissions already exist, skipping`);
    return;
  }

  // Insert all permissions
  await Permission.insertMany(PERMISSIONS);
  logger.info(`[Seeder 01] Inserted ${PERMISSIONS.length} permissions`);

  // Compute manifest hash (SHA-256 of sorted permission actions)
  const sortedActions = PERMISSIONS.map((p) => p.action).sort();
  const manifestHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(sortedActions))
    .digest('hex');

  // Update SystemMeta with manifest hash
  await SystemMeta.findOneAndUpdate({}, { seedManifestHash: manifestHash });
  logger.info(`[Seeder 01] Manifest hash: ${manifestHash}`);
}
