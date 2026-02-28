/**
 * SolarSpot — Entry point
 *
 * Boot order:
 *  1. Load & validate environment variables
 *  2. Connect to MongoDB
 *  3. Start HTTP server
 *  4. Register graceful-shutdown hooks
 */

import { config } from '@config/env';
import { connectDB } from '@config/db';
import logger from '@utils/logger';

// ─── Validate required environment variables before anything else ──────────────
const REQUIRED_VARS: (keyof typeof config)[] = [
  'MONGODB_URI',
  'JWT_SECRET',
  'COOKIE_SECRET',
  // JWT_REFRESH_EXPIRES is validated by Joi schema in env.ts, no separate refresh secret needed.
];

const missing = REQUIRED_VARS.filter((key) => !config[key]);
if (missing.length > 0) {
  logger.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// ─── Security validation (fail-fast) ─────────────────────────────────────────
function isLocalhostOrigin(origin: string): boolean {
  return /^http:\/\/localhost:\d+$/.test(origin);
}

function isValidOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    // Must be an origin only (no path/query/fragment)
    if (u.origin !== origin) return false;
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const corsOrigins = config.CORS_ORIGINS;
if (!Array.isArray(corsOrigins) || corsOrigins.length === 0) {
  logger.error('CORS misconfiguration: CORS_ORIGINS is empty');
  process.exit(1);
}

if (corsOrigins.some(o => o === '*' || o.includes('*'))) {
  logger.error('CORS misconfiguration: wildcard origins are not allowed');
  process.exit(1);
}

for (const origin of corsOrigins) {
  if (!isValidOrigin(origin)) {
    logger.error(`CORS misconfiguration: invalid origin "${origin}"`);
    process.exit(1);
  }

  // Production must be HTTPS-only (localhost allowed only for non-production)
  if (config.NODE_ENV === 'production') {
    const u = new URL(origin);
    if (u.protocol !== 'https:') {
      logger.error(`CORS misconfiguration: non-HTTPS origin in production: "${origin}"`);
      process.exit(1);
    }
  } else {
    // Non-production: allow localhost http for dev
    if (origin.startsWith('http://') && !isLocalhostOrigin(origin)) {
      logger.warn(`CORS warning: non-HTTPS non-localhost origin allowed: "${origin}"`);
    }
  }
}

// ─── Import app AFTER env is validated ────────────────────────────────────────
import app from './app';
import http from 'http';

const PORT = parseInt(config.PORT, 10);
const server = http.createServer(app);

// ─── Graceful shutdown helper ──────────────────────────────────────────────────
function gracefulShutdown(signal: string): void {
  logger.info(`${signal} received — shutting down gracefully`);

  server.close((err) => {
    if (err) {
      logger.error('Error closing HTTP server:', err);
      process.exit(1);
    }
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit if shutdown takes longer than 10 s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

// ─── Unhandled promise rejections ─────────────────────────────────────────────
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection:', reason);
  // Let existing requests finish, then exit
  server.close(() => process.exit(1));
});

// ─── Uncaught exceptions ──────────────────────────────────────────────────────
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

// ─── OS termination signals ───────────────────────────────────────────────────
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Docker / cloud stop
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));  // Ctrl-C

// ─── Bootstrap ────────────────────────────────────────────────────────────────
(async () => {
  try {
    await connectDB();

    server.listen(PORT, () => {
      logger.info('─────────────────────────────────────────────');
      logger.info(`🌞  SolarSpot API`);
      logger.info(`    ENV  : ${config.NODE_ENV}`);
      logger.info(`    PORT : ${PORT}`);
      logger.info(`    DOCS : http://localhost:${PORT}/api/docs`);
      logger.info('─────────────────────────────────────────────');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
})();
