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
import { SystemMeta } from '@modules/permissions/system_meta.model';
import crypto from 'crypto';
import { PERMISSIONS_SEED } from './01_permissions';
import { POLICIES_SEED }    from './02_policies';
import { ROLES_SEED }       from './03_roles';

// Seeder imports
import { seedSystemMeta }      from './00_system_meta';
import { seedPermissions }     from './01_permissions';
import { seedPolicies }        from './02_policies';
import { seedRoles }           from './03_roles';
import { seedRolePermissions } from './04_role_permissions';
import { seedDemoUsers }       from './05_demo_users';
import { seedDemoStations }    from './06_demo_stations';
import { seedDemoReviews }     from './07_demo_reviews';

type SeederEntry = { name: string; fn: (session: mongoose.ClientSession) => Promise<void> };

const CORE_SEEDERS: SeederEntry[] = [
  { name: '00_system_meta',      fn: seedSystemMeta },
  { name: '01_permissions',      fn: seedPermissions },
  { name: '02_policies',         fn: seedPolicies },
  { name: '03_roles',            fn: seedRoles },
  { name: '04_role_permissions', fn: seedRolePermissions },
];

const DEMO_SEEDERS: SeederEntry[] = [
  { name: '05_demo_users',     fn: seedDemoUsers },
  { name: '06_demo_stations',  fn: seedDemoStations },
  { name: '07_demo_reviews',   fn: seedDemoReviews },
];

type SeedMode = 'full' | 'core' | 'demo' | 'verify';

async function run(mode: SeedMode = 'full'): Promise<void> {
  await mongoose.connect(config.MONGODB_URI);
  logger.info(`Seed runner connected to MongoDB [mode: ${mode}]`);

  if (mode === 'verify') {
    const meta = await SystemMeta.findOne().lean();
    if (!meta) {
      logger.error('seed:verify FAILED — system_meta document not found. Run seed:core first.');
      await mongoose.disconnect();
      process.exit(1);
    }
    const expected = crypto
      .createHash('sha256')
      .update(JSON.stringify({ PERMISSIONS_SEED, POLICIES_SEED, ROLES_SEED }))
      .digest('hex');
    if (meta.seedManifestHash !== expected) {
      logger.error(`seed:verify FAILED — manifest hash mismatch.\n  stored : ${meta.seedManifestHash}\n  current: ${expected}`);
      await mongoose.disconnect();
      process.exit(1);
    }
    logger.info(`seed:verify PASSED — schema v${meta.schemaVersion}, seeded at ${meta.seededAt.toISOString()}`);
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

  // Run all seeders — use a transaction when the server supports it (replica set / Atlas),
  // otherwise fall back to sequential upserts without a session (standalone dev MongoDB).
  const session = await mongoose.startSession();
  let usedTransaction = false;
  try {
    await session.withTransaction(async () => {
      for (const seeder of seeders) {
        logger.info(`Running seeder: ${seeder.name}`);
        await seeder.fn(session);
        logger.info(`✓ ${seeder.name}`);
      }
    });
    usedTransaction = true;
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? '';
    if (msg.includes('replica set') || msg.includes('Transaction numbers')) {
      logger.warn('Transactions not supported on this MongoDB instance — falling back to no-session mode');
      for (const seeder of seeders) {
        logger.info(`Running seeder: ${seeder.name}`);
        await seeder.fn(undefined as unknown as mongoose.ClientSession);
        logger.info(`✓ ${seeder.name}`);
      }
    } else {
      throw err;
    }
  } finally {
    session.endSession();
    await mongoose.disconnect();
  }
  logger.info(`Seed complete [mode: ${mode}] — ${seeders.length} seeders ran${usedTransaction ? ' (with transaction)' : ' (no-session fallback)'}`);
}

// CLI entry point
const mode = (process.argv[2] as SeedMode) ?? 'full';
run(mode).catch((err) => {
  logger.error('Seed runner failed:', err);
  process.exit(1);
});
