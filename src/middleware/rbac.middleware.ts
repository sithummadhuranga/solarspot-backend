import { Request, Response, NextFunction } from 'express';
import { Document } from 'mongoose';
import { container } from '@/container';
import ApiError from '@utils/ApiError';
import { PermissionAction } from '@/types';

/** Role hierarchy — higher number = more permissions */
export const ROLES = {
  user: 1,
  moderator: 2,
  admin: 3,
} as const;

export type RoleName = keyof typeof ROLES;

/**
 * checkPermission — RBAC + PBAC middleware factory.
 * Uses PermissionEngine.evaluate() to check role permissions and all attached policies.
 *
 * @param action — e.g. 'stations:approve', 'reviews:moderate'
 *
 * Usage: router.post('/', protect, checkPermission('stations:create'), validate(...), controller)
 */
export const checkPermission =
  (action: PermissionAction) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }

    const user = {
      _id: req.user._id as unknown as import('mongoose').Types.ObjectId,
      role: req.user.role,
      roleLevel: req.user.roleLevel ?? ROLES[req.user.role as RoleName] ?? 1,
      isEmailVerified: req.user.isEmailVerified,
      isActive: req.user.isActive ?? true,
      isBanned: req.user.isBanned ?? false,
    };

    // Resource document for owner_match and field_equals policies
    const resource = (req as Request & { resource?: Document }).resource;

    const result = await container.permissionEngine.evaluate(user, action, resource);

    if (!result.allowed) {
      return next(ApiError.forbidden(result.reason ?? 'Insufficient permissions'));
    }

    next();
  };

/**
 * loadResource — middleware that loads a Mongoose document into req.resource.
 * Used before checkPermission() when policies need to evaluate the resource.
 *
 * @param Model — Mongoose model to query
 * @param idParam — route param name (default: 'id')
 */
export function loadResource(Model: { findById: (id: string) => Promise<Document | null> }, idParam = 'id') {
  return async (req: Request & { resource?: Document }, _res: Response, next: NextFunction): Promise<void> => {
    const id = String(req.params[idParam]);
    if (!id) return next();

    const doc = await Model.findById(id);
    if (!doc) return next(ApiError.notFound());

    req.resource = doc;
    next();
  };
}
