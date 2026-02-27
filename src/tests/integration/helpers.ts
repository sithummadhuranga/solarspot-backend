/**
 * Shared helper for integration tests.
 *
 * Uses MongoMemoryReplSet (single-node replica set) so Mongoose transactions
 * work correctly without needing a live MongoDB Atlas connection.
 * Each test file that calls connectTestDb() gets a fresh in-memory instance.
 *
 * Call connectTestDb() in beforeAll, disconnectTestDb() in afterAll.
 * Call clearTestDb() in beforeEach to reset state between tests.
 */
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { seedPermissions }    from '@/seed/01_permissions';
import { seedPolicies }       from '@/seed/02_policies';
import { seedRoles }          from '@/seed/03_roles';
import { seedRolePermissions } from '@/seed/04_role_permissions';

// One in-memory server per test-file process (jest runs files in their own workers)
let replSet: MongoMemoryReplSet | null = null;

export async function connectTestDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) return;

  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  const uri = replSet.getUri();
  await mongoose.connect(uri, { dbName: 'solarspot_test' });
}

export async function disconnectTestDb(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (replSet) {
    await replSet.stop();
    replSet = null;
  }
}

export async function clearTestDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

/** Seed the RBAC core data (permissions, policies, roles, role_permissions) */
export async function seedCore(): Promise<void> {
  // Run each seeder in its own transaction so each commit is visible to the next
  for (const fn of [seedPermissions, seedPolicies, seedRoles, seedRolePermissions]) {
    const session = await mongoose.startSession();
    await session.withTransaction(() => fn(session));
    await session.endSession();
  }
}
