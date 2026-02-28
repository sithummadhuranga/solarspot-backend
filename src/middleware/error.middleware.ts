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

  // Malformed JSON body (thrown by express.json / body-parser)
  // Typical shape: SyntaxError with `status` 400 and `type` = 'entity.parse.failed'
  const maybeParseErr = err as unknown as { status?: number; type?: string; message?: string };
  if (maybeParseErr?.status === 400 && maybeParseErr?.type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      message: 'Invalid JSON in request body',
      errors: [],
      statusCode: 400,
    });
    return;
  }

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
