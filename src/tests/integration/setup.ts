/**
 * Integration test global setup — starts an in-memory MongoDB REPLICA SET
 * (required for transactions used in register, deleteMe, adminUpdateUser, etc.)
 * Ref: MASTER_PROMPT.md → Testing → Integration tests hit actual Express router + in-memory DB
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';

export default async function globalSetup(): Promise<void> {
  const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = mongod.getUri();

  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB_NAME = 'solarspot_test';
  process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-64-chars-long-for-compliance-xyz';
  process.env.COOKIE_SECRET = 'test-cookie-secret-32-chars-min!';
  process.env.EMAIL_PREVIEW = 'true';
  process.env.NODE_ENV = 'test';

  // Share instance with teardown via global
  (global as Record<string, unknown>).__MONGOD__ = mongod;
}
