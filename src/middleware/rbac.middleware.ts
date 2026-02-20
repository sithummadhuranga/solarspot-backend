import { Request, Response, NextFunction } from 'express';
import ApiError from '@utils/ApiError';

/** Role hierarchy — higher number = more permissions */
export const ROLES = {
  user: 1,
  moderator: 2,
  admin: 3,
} as const;

export type RoleName = keyof typeof ROLES;

/**
 * Permission map — defines which roles can perform each action.
 * Expand this map as new actions are introduced.
 */
const PERMISSIONS: Record<string, RoleName[]> = {
  'stations:create':  ['user', 'moderator', 'admin'],
  'stations:approve': ['moderator', 'admin'],
  'stations:delete':  ['moderator', 'admin'],
  'reviews:create':   ['user', 'moderator', 'admin'],
  'reviews:moderate': ['moderator', 'admin'],
  'users:manage':     ['admin'],
};

/**
 * checkPermission — RBAC middleware factory.
 * @param action — e.g. 'stations:approve'
 *
 * Usage: router.patch('/:id/approve', protect, checkPermission('stations:approve'), controller)
 */
export const checkPermission =
  (action: string) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    // TODO: replace stub logic with real guard once protect sets req.user
    const userRole = (req.user?.role as RoleName) ?? 'user';
    const allowed = PERMISSIONS[action] ?? [];

    if (!allowed.includes(userRole)) {
      next(ApiError.forbidden(`Role '${userRole}' cannot perform '${action}'`));
      return;
    }

    next();
  };
