/**
 * Seed runner — executes seeders in strict dependency order.
 *
 * Owner: Member 4 — implement after all models are in place.
 * Ref:  PROJECT_OVERVIEW.md → Seeder Commands
 *       PROJECT_OVERVIEW.md → Seeder order: 00 → 01 → 02 → 03 → 04 → 05 → 06 → 07
 *
 * Commands (add to package.json scripts):
 *   npm run seed          → runs 00–07 (full)
 *   npm run seed:core     → runs 00–04 (safe for production)
 *   npm run seed:demo     → runs 05–07 (demo data only)
 *   npm run seed:reset    → drop DB + full seed (dev only)
 *   npm run seed:verify   → validate seedManifestHash in system_meta
 *
 * ⚠️  The app will NOT start cleanly if seed:core has not been run.
 *     server.ts checks system_meta and warns with an actionable message.
 *
 * All seeder operations run inside a single MongoDB session transaction.
 * See MASTER_PROMPT.md → ACID → Atomicity.
 */

import mongoose from 'mongoose';
import { config } from '@config/env';
import logger from '@utils/logger';

// Seeder imports — uncomment as each seeder is implemented
// import { seedSystemMeta }      from './00_system_meta';
// import { seedPermissions }     from './01_permissions';
// import { seedPolicies }        from './02_policies';
// import { seedRoles }           from './03_roles';
// import { seedRolePermissions } from './04_role_permissions';
// import { seedDemoUsers }       from './05_demo_users';
// import { seedDemoStations }    from './06_demo_stations';
// import { seedDemoReviews }     from './07_demo_reviews';

type SeederEntry = { name: string; fn: (session: mongoose.ClientSession) => Promise<void> };

const CORE_SEEDERS: SeederEntry[] = [
  // TODO: Member 4 — uncomment as implemented
  // { name: '00_system_meta',      fn: seedSystemMeta },
  // { name: '01_permissions',      fn: seedPermissions },
  // { name: '02_policies',         fn: seedPolicies },
  // { name: '03_roles',            fn: seedRoles },
  // { name: '04_role_permissions', fn: seedRolePermissions },
];

const DEMO_SEEDERS: SeederEntry[] = [
  // TODO: fill in as demo seeders are implemented
  // { name: '05_demo_users',     fn: seedDemoUsers },
  // { name: '06_demo_stations',  fn: seedDemoStations },
  // { name: '07_demo_reviews',   fn: seedDemoReviews },
];

type SeedMode = 'full' | 'core' | 'demo' | 'verify';

async function run(mode: SeedMode = 'full'): Promise<void> {
  await mongoose.connect(config.MONGODB_URI, { dbName: config.MONGODB_DB_NAME });
  logger.info(`Seed runner connected to MongoDB [mode: ${mode}]`);

  if (mode === 'verify') {
    // TODO: Member 4 — read system_meta.seedManifestHash and verify it matches
    logger.warn('seed:verify not yet implemented');
    await mongoose.disconnect();
    return;
  }

  const seeders = mode === 'core'
    ? CORE_SEEDERS
    : mode === 'demo'
    ? DEMO_SEEDERS
    : [...CORE_SEEDERS, ...DEMO_SEEDERS];

  if (seeders.length === 0) {
    logger.warn('No seeders are registered yet. Implement them and uncomment in runner.ts');
    await mongoose.disconnect();
    return;
  }

  // Run all seeders in a single transaction — all or nothing (Atomicity rule)
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const seeder of seeders) {
        logger.info(`Running seeder: ${seeder.name}`);
        // await seeder.fn(session);
        logger.info(`✓ ${seeder.name}`);
      }
    });
    logger.info(`Seed complete [mode: ${mode}] — ${seeders.length} seeders ran`);
  } finally {
    session.endSession();
    await mongoose.disconnect();
  }
}

// CLI entry point
const mode = (process.argv[2] as SeedMode) ?? 'full';
run(mode).catch((err) => {
  logger.error('Seed runner failed:', err);
  process.exit(1);
});
