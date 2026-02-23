import { MongoMemoryServer } from 'mongodb-memory-server';

declare global {
  var __MONGO_URI__: string;
  var __MONGOD__: MongoMemoryServer;
}

export default async function setup(): Promise<void> {
  const mongod = await MongoMemoryServer.create({
    instance: { dbName: 'solarspot_test' },
  });

  global.__MONGOD__ = mongod;
  global.__MONGO_URI__ = mongod.getUri();
  process.env.MONGODB_URI = mongod.getUri();

  process.env.JWT_SECRET          = 'test-jwt-secret-32-chars-minimum!!';
  process.env.JWT_REFRESH_SECRET  = 'test-refresh-secret-32-chars-min!';
  process.env.JWT_ACCESS_EXPIRES  = '15m';
  process.env.JWT_REFRESH_EXPIRES = '7d';
  process.env.NODE_ENV            = 'test';
  process.env.FRONTEND_URL        = 'http://localhost:3000';
  process.env.BREVO_SMTP_HOST     = 'smtp-relay.brevo.com';
  process.env.BREVO_SMTP_PORT     = '587';
  process.env.BREVO_SMTP_USER     = 'test@example.com';
  process.env.BREVO_SMTP_PASS     = 'test-key';
  process.env.EMAIL_FROM          = 'noreply@solarspot.app';
}
