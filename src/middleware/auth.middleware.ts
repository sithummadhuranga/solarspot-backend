import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@config/env';
import { User } from '@modules/users/user.model';
import ApiError from '@utils/ApiError';
import asyncHandler from './asyncHandler';
import { IRole } from '@/types';

// Extend Express Request to carry the authenticated user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        _id: string;
        email: string;
        role: string;
        roleLevel: number;
        isEmailVerified: boolean;
        isActive: boolean;
        isBanned: boolean;
      };
    }
  }
}

/**
 * protect — requires a valid JWT access token.
 * Attaches decoded user to req.user.
 */
export const protect = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Access token missing or malformed');
    }

    const token = authHeader.split(' ')[1];
    let decoded: { id: string };

    try {
      decoded = jwt.verify(token, config.JWT_SECRET) as { id: string };
    } catch {
      throw ApiError.unauthorized('Access token invalid or expired');
    }

    const user = await User.findById(decoded.id)
      .populate('role')
      .lean();

    if (!user || !user.isActive) {
      throw ApiError.unauthorized('Account not found or inactive');
    }

    const role = user.role as IRole;
    req.user = {
      _id: user._id.toString(),
      email: user.email,
      role: role?.name ?? 'user',
      roleLevel: role?.roleLevel ?? 1,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      isBanned: user.isBanned,
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
    if (!authHeader?.startsWith('Bearer ')) {
      return next();
    }

    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, config.JWT_SECRET) as { id: string };

      const user = await User.findById(decoded.id).populate('role').lean();
      if (user?.isActive) {
        const role = user.role as IRole;
        req.user = {
          _id: user._id.toString(),
          email: user.email,
          role: role?.name ?? 'user',
          roleLevel: role?.roleLevel ?? 1,
          isEmailVerified: user.isEmailVerified,
          isActive: user.isActive,
          isBanned: user.isBanned,
        };
      }
    } catch {
      // Silently ignore — optionalAuth never throws
    }

    next();
  }
);
