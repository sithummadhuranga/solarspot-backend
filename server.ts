

import { config } from '@config/env';
import { connectDB } from '@config/db';
import logger from '@utils/logger';

const REQUIRED_VARS: (keyof typeof config)[] = [
  'MONGODB_URI',
  'JWT_SECRET',
  'COOKIE_SECRET',
];

const missing = REQUIRED_VARS.filter((key) => !config[key]);
if (missing.length > 0) {
  logger.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

function isLocalhostOrigin(origin: string): boolean {
  return /^http:\/\/localhost:\d+$/.test(origin);
}

function isValidOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
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

  if (config.NODE_ENV === 'production') {
    const u = new URL(origin);
    if (u.protocol !== 'https:') {
      logger.error(`CORS misconfiguration: non-HTTPS origin in production: "${origin}"`);
      process.exit(1);
    }
  } else {
    if (origin.startsWith('http://') && !isLocalhostOrigin(origin)) {
      logger.warn(`CORS warning: non-HTTPS non-localhost origin allowed: "${origin}"`);
    }
  }
}

import app from './app';
import http from 'http';
import { runSeedersOnExistingConnection, SeedMode } from './src/seed/runner';
import { SystemMeta } from '@modules/permissions/system_meta.model';

const PORT = parseInt(config.PORT, 10);
const server = http.createServer(app);

function hasBootstrapAdminCredentials(): boolean {
  return Boolean(config.ADMIN_EMAIL.trim() && config.ADMIN_PASSWORD.trim());
}

async function ensureSeededState(): Promise<void> {
  const runSeedMode = config.RUN_SEED as SeedMode | '';

  if (runSeedMode) {
    const validModes: SeedMode[] = ['full', 'core', 'demo', 'production', 'verify'];
    if (!validModes.includes(runSeedMode)) {
      logger.error(`RUN_SEED has invalid value "${runSeedMode}". Valid: ${validModes.join(', ')}`);
      process.exit(1);
    }
    logger.info(`RUN_SEED=${runSeedMode} detected — running seed before server start`);
    await runSeedersOnExistingConnection(runSeedMode);
    logger.info('Seed completed — server will now start. Remove RUN_SEED env var to skip on next deploy.');
    return;
  }

  const systemMeta = await SystemMeta.findOne().select('_id').lean();
  if (systemMeta) {
    return;
  }

  if (config.NODE_ENV === 'production') {
    if (!hasBootstrapAdminCredentials()) {
      logger.error(
        'Production database is empty and bootstrap credentials are missing. ' +
        'Set ADMIN_EMAIL and ADMIN_PASSWORD, or deploy once with RUN_SEED=production.',
      );
      process.exit(1);
    }

    logger.warn('No seed metadata found in production database — running initial production bootstrap seed.');
    await runSeedersOnExistingConnection('production');
    logger.info('Initial production bootstrap seed completed.');
    return;
  }

  logger.warn(
    'Database seed metadata not found. Run npm run seed:core, npm run seed:production, or set RUN_SEED for one startup bootstrap.',
  );
}

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

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection:', reason);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Docker / cloud stop
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));  // Ctrl-C

(async () => {
  try {
    await connectDB();
    await ensureSeededState();

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
