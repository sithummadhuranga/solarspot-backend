import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import asyncHandler from './asyncHandler';
import ApiError from '@utils/ApiError';

declare module 'express-serve-static-core' {
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


export const protect = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Access token required');
    }

    const token = authHeader.slice(7);

    let decoded: { _id: string; email: string; role: 'user' | 'moderator' | 'admin'; isEmailVerified: boolean };
    try {
      const secret = process.env.JWT_SECRET ?? '';
      decoded = jwt.verify(token, secret) as typeof decoded;
    } catch {
      throw ApiError.unauthorized('Invalid or expired access token');
    }

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
      } catch {
        req.user = undefined;
      }
    }
    next();
  }
);
