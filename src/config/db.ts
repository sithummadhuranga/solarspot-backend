import mongoose from 'mongoose';
import logger from '@utils/logger';
import { config } from '@config/env';

/**
 * Connects to MongoDB using the MONGODB_URI environment variable.
 * Exits the process with code 1 if the connection fails.
 */
export async function connectDB(): Promise<void> {
  const uri = config.MONGODB_URI;

  if (!uri) {
    logger.error('MONGODB_URI is not defined in environment variables');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri, { dbName: config.MONGODB_DB_NAME });
    logger.info(`MongoDB connected: ${conn.connection.host} / ${conn.connection.name}`);
  } catch (error) {
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
