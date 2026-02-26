/**
 * Shared helper for integration tests.
 * Call connectTestDb() in beforeAll, disconnectTestDb() in afterAll.
 * Call clearTestDb() in beforeEach to reset state between tests.
 */
import mongoose from 'mongoose';
import { seedPermissions }    from '@/seed/01_permissions';
import { seedPolicies }       from '@/seed/02_policies';
import { seedRoles }          from '@/seed/03_roles';
import { seedRolePermissions } from '@/seed/04_role_permissions';

let connected = false;

export async function connectTestDb(): Promise<void> {
  if (!connected) {
    await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME });
    connected = true;
  }
}

export async function disconnectTestDb(): Promise<void> {
  if (connected) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    connected = false;
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
