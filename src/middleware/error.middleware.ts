import { Request, Response, NextFunction } from 'express';
import { Error as MongooseError } from 'mongoose';
import jwt from 'jsonwebtoken';
import ApiError from '@utils/ApiError';
import logger from '@utils/logger';

interface MongoServerError extends Error {
  code?: number;
  keyValue?: Record<string, unknown>;
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const isProd = process.env.NODE_ENV === 'production';

  if (err instanceof ApiError) {
    logger.warn(`[${err.statusCode}] ${req.method} ${req.originalUrl} — ${err.message}`);
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors ?? [],
      statusCode: err.statusCode,
    });
    return;
  }

  if (err instanceof MongooseError.ValidationError) {
    const errors = Object.values(err.errors).map((e) => e.message);
    logger.warn(`[422] ${req.method} ${req.originalUrl} — Validation: ${errors.join('; ')}`);
    res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors,
      statusCode: 422,
    });
    return;
  }

  if (err instanceof MongooseError.CastError) {
    logger.warn(`[404] ${req.method} ${req.originalUrl} — CastError: ${err.message}`);
    res.status(404).json({
      success: false,
      message: 'Resource not found',
      errors: [],
      statusCode: 404,
    });
    return;
  }

  const mongoErr = err as MongoServerError;
  if (mongoErr.code === 11000 && mongoErr.keyValue) {
    const field = Object.keys(mongoErr.keyValue)[0];
    const message = `Duplicate value for field: ${field}`;
    logger.warn(`[409] ${req.method} ${req.originalUrl} — ${message}`);
    res.status(409).json({
      success: false,
      message,
      errors: [message],
      statusCode: 409,
    });
    return;
  }

  if (err instanceof jwt.TokenExpiredError) {
    res.status(401).json({
      success: false,
      message: 'Access token expired',
      errors: [],
      statusCode: 401,
    });
    return;
  }

  if (err instanceof jwt.JsonWebTokenError) {
    res.status(401).json({
      success: false,
      message: 'Invalid access token',
      errors: [],
      statusCode: 401,
    });
    return;
  }

  logger.error(`[500] ${req.method} ${req.originalUrl} — ${err.message}`, {
    stack: isProd ? undefined : err.stack,
  });

  res.status(500).json({
    success: false,
    message: isProd ? 'Internal server error' : err.message,
    errors: [],
    statusCode: 500,
  });
};
