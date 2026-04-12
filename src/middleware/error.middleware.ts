import { Request, Response, NextFunction } from 'express';
import ApiError from '@utils/ApiError';
import logger from '@utils/logger';

type DuplicateKeyError = Error & {
  code?: number;
  keyPattern?: Record<string, unknown>;
};

function isDuplicateKeyError(error: unknown): error is DuplicateKeyError {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === 11000;
}

function getDuplicateKeyMessage(error: DuplicateKeyError): string {
  const keyPattern = error.keyPattern ?? {};

  if ('station' in keyPattern && 'author' in keyPattern) {
    return 'You have already reviewed this station. Edit or delete your existing review before posting a new one.';
  }

  return 'A record with the same value already exists.';
}


export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error(`${req.method} ${req.originalUrl} — ${err.message}`, {
    stack: err.stack,
  });

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

  if (isDuplicateKeyError(err)) {
    res.status(409).json({
      success: false,
      message: getDuplicateKeyMessage(err),
      errors: [],
      statusCode: 409,
    });
    return;
  }

  res.status(500).json({
    success:    false,
    message:    process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    errors:     [],
    statusCode: 500,
  });
};
