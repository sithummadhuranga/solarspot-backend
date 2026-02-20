import { Request, Response, NextFunction } from 'express';
import ApiError from '@utils/ApiError';
import logger from '@utils/logger';

/**
 * Global error-handling middleware.
 * Must be mounted LAST in app.ts after all routes.
 */
export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error(`${req.method} ${req.originalUrl} — ${err.message}`, {
    stack: err.stack,
  });

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success:    false,
      message:    err.message,
      errors:     err.errors ?? [],
      statusCode: err.statusCode,
    });
    return;
  }

  // Unhandled / generic errors — mask internals in production
  res.status(500).json({
    success:    false,
    message:    process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    errors:     [],
    statusCode: 500,
  });
};
