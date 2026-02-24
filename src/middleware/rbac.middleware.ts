import { Request, Response, NextFunction } from 'express';
import { Document } from 'mongoose';
import ApiError from '@utils/ApiError';
import PermissionEngine from '@services/permission.engine';
import logger from '@utils/logger';
import User from '@modules/users/user.model';

// Extend Express Request to include resource for policy evaluation
declare global {
  namespace Express {
    interface Request {
      resource?: Document;
    }
  }
}

/**
 * RBAC Middleware — Modern PBAC Implementation
 * 
 * Uses PermissionEngine for 7-step policy-based access control:
 * 1. Cache check
 * 2. Load user role
 * 3. Admin bypass
 * 4. Check permission
 * 5. Evaluate policies
 * 6. Check user overrides
 * 7. Cache result
 * 
 * Usage:
 *   router.post('/stations', auth, checkPermission('stations.create'), createStation);
 *   router.patch('/stations/:id', auth, loadResource('Station'), checkPermission('stations.update'), updateStation);
 */

/**
 * Check if user has permission to perform action.
 * 
 * @param action - Permission action (e.g., 'stations.create', 'reviews.delete')
 * @param options - Optional configuration
 * @param options.resourceIdParam - Request param name for resourceId (default: 'id')
 * @param options.resourceIdBody - Request body field for resourceId
 */
export const checkPermission = (
  action: string,
  options?: {
    resourceIdParam?: string;
    resourceIdBody?: string;
  }
) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authUser = req.user;

      if (!authUser) {
        throw new ApiError(401, 'Authentication required');
      }

      // Load full user document for PermissionEngine (needs role populated)
      const user = await User.findById(authUser._id).populate('role');

      if (!user) {
        throw new ApiError(401, 'User not found');
      }

      // Extract resourceId from params or body (if applicable)
      let resourceId: string | undefined;

      if (options?.resourceIdParam) {
        const paramValue = req.params[options.resourceIdParam];
        resourceId = Array.isArray(paramValue) ? paramValue[0] : paramValue;
      } else if (options?.resourceIdBody) {
        resourceId = req.body?.[options.resourceIdBody];
      } else if (req.params.id) {
        const paramValue = req.params.id;
        resourceId = Array.isArray(paramValue) ? paramValue[0] : paramValue;
      }

      // Evaluate permission using PermissionEngine
      const result = await PermissionEngine.evaluate(user, action, req.resource);

      if (!result.allowed) {
        logger.warn(`Permission denied: ${authUser.email} → ${action} (${result.reason})`);
        throw new ApiError(403, result.reason || 'Forbidden: insufficient permissions');
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Load resource from database and attach to req.resource.
 * 
 * Required for owner_match and ownership_check policies.
 * 
 * @param modelName - Model name (e.g., 'Station', 'Review')
 * @param options - Optional configuration
 * @param options.idParam - Request param name for ID (default: 'id')
 * @param options.populateFields - Fields to populate (default: none)
 * 
 * @example
 *   router.patch('/stations/:id', auth, loadResource('Station'), checkPermission('stations.update'), ...)
 */
export const loadResource = (
  modelName: string,
  options?: {
    idParam?: string;
    populateFields?: string[];
  }
) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = options?.idParam || 'id';
      const paramValue = req.params[idParam];
      const resourceId = Array.isArray(paramValue) ? paramValue[0] : paramValue;

      if (!resourceId) {
        throw new ApiError(400, `Missing resource ID in params.${idParam}`);
      }

      // Dynamic import to avoid circular dependencies
      const mongoose = await import('mongoose');
      const Model = mongoose.default.model(modelName);

      let query = Model.findById(resourceId);

      if (options?.populateFields) {
        options.populateFields.forEach((field) => {
          query = query.populate(field);
        });
      }

      const resource = await query;

      if (!resource) {
        throw new ApiError(404, `${modelName} not found`);
      }

      // Attach to request for policy evaluation
      req.resource = resource as Document;

      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Flush permission cache for a user.
 * 
 * Call after operations that modify user permissions/roles.
 * 
 * @example
 *   router.patch('/users/:id/role', auth, checkPermission('users.update_role'), updateUserRole, flushUserCache);
 */
export const flushUserCache = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const paramValue = req.params.id;
    const userId = (Array.isArray(paramValue) ? paramValue[0] : paramValue) || req.user?._id;

    if (userId) {
      PermissionEngine.flushCache(userId);
      logger.info(`Flushed permission cache for user: ${userId}`);
    }

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Flush entire permission cache.
 * 
 * Call after seeding or bulk permission changes.
 * 
 * @example
 *   router.post('/permissions/reload', auth, checkPermission('system.reload_permissions'), reloadPermissions, flushAllCache);
 */
export const flushAllCache = (_req: Request, _res: Response, next: NextFunction): void => {
  try {
    PermissionEngine.flushAll();
    logger.info('Flushed all permission caches');
    next();
  } catch (err) {
    next(err);
  }
};
