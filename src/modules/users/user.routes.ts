/**
 * User routes — 6 endpoints.
 *
 * Middleware order (MASTER_PROMPT): protect → checkPermission → validate → controller
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Users
 */

import { Router }              from 'express';
import { protect, optionalAuth } from '@middleware/auth.middleware';
import { checkPermission }     from '@middleware/rbac.middleware';
import { validate }            from '@middleware/validate.middleware';
import * as UserController     from './user.controller';
import * as V                  from './user.validation';

const router = Router();

// ─── Own profile ─────────────────────────────────────────────────────────────
router.get('/me',    protect, checkPermission('users.read-own'),  UserController.getMe);
router.put('/me',    protect, checkPermission('users.edit-own'),  validate(V.updateMeSchema), UserController.updateMe);
router.delete('/me', protect, checkPermission('users.edit-own'),  UserController.deleteMe);

// ─── Admin user management ───────────────────────────────────────────────────
router.get('/',     protect, checkPermission('users.read-list'),  UserController.listUsers);
router.get('/:id',  optionalAuth, checkPermission('users.read-public'), UserController.getUserById);
router.put('/:id',  protect, checkPermission('users.manage'),     validate(V.adminUpdateUserSchema), UserController.adminUpdateUser);

export default router;
