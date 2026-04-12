import mongoose from 'mongoose';
import { config } from '@config/env';
import logger from '@utils/logger';

function extractMongoHost(uri: string): string | null {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]+@)?([^/?]+)/.exec(uri.trim());
  return match?.[1] ?? null;
}

function getMongoUriConfigError(uri: string): string | null {
  const trimmed = uri.trim();

  if (!/^mongodb(?:\+srv)?:\/\//.test(trimmed)) {
    return 'MONGODB_URI must start with mongodb:// or mongodb+srv://';
  }

  if (/(<user>|<password>|<cluster>|REPLACE_WITH)/i.test(trimmed)) {
    return 'MONGODB_URI still contains placeholder values from the example configuration';
  }

  const host = extractMongoHost(trimmed);
  if (!host) {
    return 'MONGODB_URI is missing a MongoDB host';
  }

  if (trimmed.startsWith('mongodb+srv://')) {
    if (host.includes(',')) {
      return 'mongodb+srv:// connection strings must contain a single SRV hostname';
    }

    if (/^\d+$/.test(host) || !host.includes('.')) {
      return `MONGODB_URI SRV host "${host}" is invalid. Use the full Atlas hostname, for example cluster0.abcde.mongodb.net`;
    }
  }

  return null;
}


export async function connectDB(): Promise<void> {
  const uri = config.MONGODB_URI;

  if (!uri) {
    logger.error('MONGODB_URI is not defined in environment variables');
    process.exit(1);
  }

  const validationError = getMongoUriConfigError(uri);
  if (validationError) {
    logger.error('Invalid MONGODB_URI configuration', {
      reason: validationError,
      host: extractMongoHost(uri),
    });
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri, {
      dbName: config.MONGODB_DB_NAME,
    });
    logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    const networkError = error as NodeJS.ErrnoException & { hostname?: string };

    if (networkError?.code === 'ENOTFOUND') {
      logger.error('MongoDB connection error: the configured hostname could not be resolved. Check Render MONGODB_URI and use the full Atlas connection string.', {
        code: networkError.code,
        hostname: networkError.hostname,
      });
    }

    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });

  mongoose.connection.on('error', (err: Error) => {
    logger.error('MongoDB runtime error:', err);
  });
}
