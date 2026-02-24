import mongoose from 'mongoose';
import logger from '@utils/logger';
import { config } from '@config/env';
import { seed00SystemMeta } from './00_system-meta';
import { seed01Permissions } from './01_permissions';
import { seed02Policies } from './02_policies';
import { seed03Roles } from './03_roles';
import { seed04RolePermissions } from './04_role-permissions';
import { seed05DemoUsers } from './05_demo-users';
import { seed06DemoStations } from './06_demo-stations';
import { seed07DemoReviews } from './07_demo-reviews';

/**
 * Seeder Runner
 * 
 * Commands:
 * - npm run seed          → runs all seeders (00-07)
 * - npm run seed:core     → runs core seeders only (00-04)
 * - npm run seed:demo     → runs demo data only (05-07)
 * - npm run seed:reset    → drops DB + runs all seeders
 */

const CORE_SEEDERS = [
  { name: '00_system-meta', fn: seed00SystemMeta },
  { name: '01_permissions', fn: seed01Permissions },
  { name: '02_policies', fn: seed02Policies },
  { name: '03_roles', fn: seed03Roles },
  { name: '04_role-permissions', fn: seed04RolePermissions },
];

const DEMO_SEEDERS = [
  { name: '05_demo-users', fn: seed05DemoUsers },
  { name: '06_demo-stations', fn: seed06DemoStations },
  { name: '07_demo-reviews', fn: seed07DemoReviews },
];

async function connectDB(): Promise<void> {
  await mongoose.connect(config.MONGODB_URI);
  logger.info('MongoDB connected for seeding');
}

async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

async function runSeeders(seeders: Array<{ name: string; fn: () => Promise<void> }>): Promise<void> {
  for (const seeder of seeders) {
    logger.info(`Running seeder: ${seeder.name}`);
    try {
      await seeder.fn();
    } catch (err) {
      logger.error(`Seeder ${seeder.name} failed:`, err);
      throw err;
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    await connectDB();

    switch (command) {
      case '--core':
        logger.info('Running core seeders (00-04)...');
        await runSeeders(CORE_SEEDERS);
        break;

      case '--demo':
        logger.info('Running demo seeders (05-07)...');
        await runSeeders(DEMO_SEEDERS);
        break;

      case '--reset':
        logger.warn('RESET MODE: Dropping entire database...');
        await mongoose.connection.dropDatabase();
        logger.info('Database dropped. Running all seeders...');
        await runSeeders([...CORE_SEEDERS, ...DEMO_SEEDERS]);
        break;

      default:
        logger.info('Running all seeders (00-07)...');
        await runSeeders([...CORE_SEEDERS, ...DEMO_SEEDERS]);
        break;
    }

    logger.info('✅ Seeding complete');
  } catch (err) {
    logger.error('❌ Seeding failed:', err);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

main();
