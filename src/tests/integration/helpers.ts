
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { seedPermissions }    from '@/seed/01_permissions';
import { seedPolicies }       from '@/seed/02_policies';
import { seedRoles }          from '@/seed/03_roles';
import { seedRolePermissions } from '@/seed/04_role_permissions';

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


export async function seedCore(): Promise<void> {
  for (const fn of [seedPermissions, seedPolicies, seedRoles, seedRolePermissions]) {
    const session = await mongoose.startSession();
    await session.withTransaction(() => fn(session));
    await session.endSession();
  }
}
