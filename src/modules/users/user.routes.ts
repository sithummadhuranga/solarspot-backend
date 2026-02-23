/**
 * User routes — 6 endpoints.
 *
 * TODO: Member 4 — uncomment route registrations when controller/service are implemented.
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Users
 *      MASTER_PROMPT.md → Route Middleware Order: protect → checkPermission → validate → controller
 */

import { Router } from 'express';
// import { protect }           from '@middleware/auth.middleware';
// import { checkPermission }   from '@middleware/rbac.middleware';
// import { validate }          from '@middleware/validate.middleware';
// import * as UserController   from './user.controller';
// import * as V                from './user.validation';

const router = Router();

// ─── Own profile ────────────────────────────────────────────────────────────
// router.get('/me',    protect, UserController.getMe);
// router.patch('/me',  protect, validate(V.updateMeSchema), UserController.updateMe);
// router.delete('/me', protect, UserController.deleteMe);

// ─── Admin routes (mount under /admin/users in app.ts) ───────────────────
// router.get('/',    protect, checkPermission('users.list'),   UserController.listUsers);
// router.get('/:id', protect, checkPermission('users.view'),   UserController.getUserById);
// router.patch('/:id', protect, checkPermission('users.edit'), validate(V.adminUpdateUserSchema), UserController.adminUpdateUser);

export default router;
