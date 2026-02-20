import { Request, Response, NextFunction } from 'express';
import asyncHandler from './asyncHandler';

// Extend Express Request to carry the authenticated user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        _id: string;
        email: string;
        role: 'user' | 'moderator' | 'admin';
        isEmailVerified: boolean;
      };
    }
  }
}

/**
 * protect — requires a valid JWT access token.
 * Attaches decoded user to req.user.
 * TODO: verify JWT, query DB for user, attach to req.user
 */
export const protect = asyncHandler(
  async (_req: Request, _res: Response, next: NextFunction) => {
    // TODO: extract Bearer token from Authorization header
    // TODO: verify with jwt.verify(token, config.JWT_SECRET)
    // TODO: fetch user from DB (exclude password)
    // TODO: throw ApiError.unauthorized() if token missing or invalid
    // TODO: attach user to req.user
    next();
  }
);

/**
 * optionalAuth — attaches req.user if a valid token is present, otherwise continues.
 * Does NOT throw if the token is missing or invalid.
 */
export const optionalAuth = asyncHandler(
  async (_req: Request, _res: Response, next: NextFunction) => {
    // TODO: same as protect, but silently continue on error
    next();
  }
);
