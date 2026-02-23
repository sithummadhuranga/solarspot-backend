/**
 * Integration teardown: stop the MongoMemoryServer.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

declare global {
  // eslint-disable-next-line no-var
  var __MONGOD__: MongoMemoryServer;
}

export default async function teardown(): Promise<void> {
  if (global.__MONGOD__) {
    await global.__MONGOD__.stop();
  }
}
