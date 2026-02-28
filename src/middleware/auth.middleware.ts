import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import asyncHandler from './asyncHandler';
import ApiError from '@utils/ApiError';

// Extend Express Request to carry the authenticated user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        _id: string;
        email: string;
        role: string;
        roleLevel?: number;
        isEmailVerified: boolean;
        isActive?: boolean;
        isBanned?: boolean;
      };
    }
  }
}

/**
 * protect — requires a valid JWT access token.
 * Extracts Bearer token from the Authorization header, verifies it, and
 * attaches the decoded payload to req.user.
 */
export const protect = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Access token required');
    }

    const token = authHeader.slice(7);

    let decoded: { _id: string; email: string; role: 'user' | 'moderator' | 'admin'; isEmailVerified: boolean };
    try {
      // Read directly from process.env so tests can set the secret after module load
      const secret = process.env.JWT_SECRET ?? '';
      decoded = jwt.verify(token, secret) as typeof decoded;
    } catch {
      throw ApiError.unauthorized('Invalid or expired access token');
    }

    // Cast to a wider type so we can safely read the roleLevel field that
    // auth.service.generateAccessToken bakes into every JWT payload.
    const full = decoded as unknown as { _id: string; email: string; role: string; isEmailVerified: boolean; roleLevel?: number };

    req.user = {
      _id:             full._id,
      email:           full.email,
      role:            full.role,
      roleLevel:       full.roleLevel,
      isEmailVerified: full.isEmailVerified ?? false,
    };

    next();
  }
);

/**
 * optionalAuth — attaches req.user if a valid token is present, otherwise continues.
 * Does NOT throw if the token is missing or invalid.
 */
export const optionalAuth = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const secret = process.env.JWT_SECRET ?? '';
        const decoded = jwt.verify(authHeader.slice(7), secret) as {
          _id: string; email: string; role: string; isEmailVerified: boolean; roleLevel?: number;
        };
        req.user = { _id: decoded._id, email: decoded.email, role: decoded.role, roleLevel: decoded.roleLevel, isEmailVerified: decoded.isEmailVerified ?? false };
      } catch { /* silently continue */ }
    }
    next();
  }
);
