/**
 * User routes — 6 endpoints.
 *
 * Middleware order (MASTER_PROMPT): protect → checkPermission → validate → controller
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Users
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Document }            from 'mongoose';
import { protect, optionalAuth } from '@middleware/auth.middleware';
import { checkPermission }     from '@middleware/rbac.middleware';
import { validate }            from '@middleware/validate.middleware';
import * as UserController     from './user.controller';
import * as V                  from './user.validation';

const router = Router();

/**
 * attachSelf — injects req.resource = { _id: req.user._id } before checkPermission
 * on /me routes so the owner_match_user policy can evaluate correctly.
 *
 * Without this, owner_match handler receives resource=undefined and always returns
 * false, blocking every authenticated user from their own profile — a production bug.
 */
const attachSelf = (
  req: Request & { resource?: Document },
  _res: Response,
  next: NextFunction,
): void => {
  if (req.user) {
    // Cast: owner_match_user only needs `_id`; full Document is not required.
    req.resource = { _id: req.user._id } as unknown as Document;
  }
  next();
};

// ─── Own profile ─────────────────────────────────────────────────────────────
router.get('/me',    protect, attachSelf, checkPermission('users.read-own'),  UserController.getMe);
router.put('/me',    protect, attachSelf, checkPermission('users.edit-own'),  validate(V.updateMeSchema), UserController.updateMe);
router.delete('/me', protect, attachSelf, checkPermission('users.edit-own'),  UserController.deleteMe);

// ─── Admin user management ───────────────────────────────────────────────────
router.get('/',     protect, checkPermission('users.read-list'),  UserController.listUsers);
// Public profile — no permission gate needed (matches station GET pattern).
// optionalAuth still populates req.user for callers that provide a token.
router.get('/:id',  optionalAuth, UserController.getUserById);
router.put('/:id',  protect, checkPermission('users.manage'),     validate(V.adminUpdateUserSchema), UserController.adminUpdateUser);

export default router;
