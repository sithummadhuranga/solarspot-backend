import { Request, Response, NextFunction } from 'express';
import ApiError from '@utils/ApiError';
import { PERMISSIONS, RoleName } from '@config/permissions.config';

/** Role hierarchy — higher number = more permissions */
export const ROLES = {
  guest: 0,
  user: 1,
  moderator: 2,
  admin: 3,
} as const;

export type { RoleName };

/**
 * checkPermission — RBAC middleware factory.
 * @param action — e.g. 'stations:approve'
 *
 * Usage: router.patch('/:id/approve', protect, checkPermission('stations:approve'), controller)
 */
export const checkPermission =
  (action: string) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const userRole = (req.user?.role as RoleName) ?? 'guest';
    const allowed = PERMISSIONS[action] ?? [];

    if (!allowed.includes(userRole)) {
      next(new ApiError(403, `Forbidden: insufficient permissions`));
      return;
    }

    next();
  };
