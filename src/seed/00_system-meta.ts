import SystemMeta from '@modules/permissions/models/system-meta.model';
import logger from '@utils/logger';

/**
 * Seeder 00 — System Metadata
 * Creates the single SystemMeta document that tracks seeding state and schema version.
 */
export async function seed00SystemMeta(): Promise<void> {
  logger.info('[Seeder 00] Running: System Metadata');

  const exists = await SystemMeta.findOne();

  if (exists) {
    logger.info('[Seeder 00] SystemMeta already exists, skipping creation');
    return;
  }

  await SystemMeta.create({
    schemaVersion: '1.0.0',
    seedManifestHash: null, // Will be set by seeder 01
    seededAt: null, // Will be set when all core seeders complete
    lastMigrationAt: null,
    metadata: {
      environment: process.env.NODE_ENV ?? 'development',
      createdBy: 'seeder:00',
    },
  });

  logger.info('[Seeder 00] SystemMeta created successfully');
}
