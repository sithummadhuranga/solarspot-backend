import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import asyncHandler from './asyncHandler';
import ApiError from '@utils/ApiError';
import { config } from '@config/env';
import User from '@modules/users/user.model';
import logger from '@utils/logger';

// ─── Extend Express Request ───────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        _id: string;
        email: string;
        role: 'user' | 'moderator' | 'admin';
        isEmailVerified: boolean;
        isActive: boolean;
      };
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function extractAndVerifyUser(req: Request): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new ApiError(401, 'Access token required');
  }

  const token = authHeader.split(' ')[1];

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new ApiError(401, 'Access token expired');
    }
    throw new ApiError(401, 'Invalid access token');
  }

  const user = await User.findById(payload.sub).select(
    '_id email role isEmailVerified isActive'
  );

  if (!user || !user.isActive) {
    logger.warn('Auth failed: user not found or deactivated', { sub: payload.sub });
    throw new ApiError(401, 'User not found or deactivated');
  }

  req.user = {
    _id: (user._id as { toString(): string }).toString(),
    email: user.email,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    isActive: user.isActive,
  };
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * protect — requires a valid JWT access token.
 * Attaches decoded + DB-verified user to req.user.
 * Throws ApiError on any failure.
 */
export const protect = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    await extractAndVerifyUser(req);
    next();
  }
);

/**
 * optionalAuth — attaches req.user if a valid token is present.
 * Silently continues without attaching user if token is missing or invalid.
 */
export const optionalAuth = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      await extractAndVerifyUser(req);
    } catch {
      // No token or invalid token — continue as unauthenticated
    }
    next();
  }
);
