import mongoose from 'mongoose';
import crypto from 'crypto';
import logger from '@utils/logger';
import { config } from '@config/env';
import SystemMeta from '@modules/permissions/models/system-meta.model';
import Permission from '@modules/permissions/models/permission.model';

/**
 * Seed Verification Script
 * 
 * Validates that the seed manifest hash matches the current permission set.
 * This ensures the database is in sync with the codebase.
 * 
 * Run: npm run seed:verify
 */

async function verifySeed(): Promise<void> {
  try {
    await mongoose.connect(config.MONGODB_URI);

    logger.info('Verifying seed manifest...');

    const systemMeta = await SystemMeta.findOne().lean();

    if (!systemMeta) {
      logger.error('❌ SystemMeta not found — database not seeded');
      logger.info('Run: npm run seed:core');
      process.exit(1);
    }

    if (!systemMeta.seedManifestHash) {
      logger.error('❌ Seed manifest hash not set');
      logger.info('Run: npm run seed:core');
      process.exit(1);
    }

    // Recompute hash from current permissions
    const permissions = await Permission.find().lean();
    const sortedActions = permissions.map((p) => p.action).sort();
    const computedHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(sortedActions))
      .digest('hex');

    if (computedHash === systemMeta.seedManifestHash) {
      logger.info('✅ Seed manifest verified — database is in sync');
      logger.info(`   Hash: ${computedHash}`);
      logger.info(`   Permissions: ${permissions.length}`);
      logger.info(`   Seeded at: ${systemMeta.seededAt}`);
    } else {
      logger.error('❌ Seed manifest mismatch — database is out of sync');
      logger.error(`   Expected: ${systemMeta.seedManifestHash}`);
      logger.error(`   Computed: ${computedHash}`);
      logger.info('Run: npm run seed:reset');
      process.exit(1);
    }
  } catch (err) {
    logger.error('Verification failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

verifySeed();
