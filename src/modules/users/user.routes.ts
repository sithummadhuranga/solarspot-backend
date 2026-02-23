import { Router } from 'express';
import { protect } from '@middleware/auth.middleware';
import { checkPermission } from '@middleware/rbac.middleware';
import {
  getMe,
  updateMe,
  getPublicProfile,
  adminListUsers,
  adminChangeRole,
  adminSoftDeleteUser,
  getAdminAnalytics,
} from '@modules/users/user.controller';

/**
 * @swagger
 * tags:
 *   - name: Users
 *     description: User profile management
 *   - name: Admin
 *     description: Administrative operations (admin role required)
 */

const router = Router();

// ─── Own profile ──────────────────────────────────────────────────────────────
router.get('/me', protect, getMe);
router.put('/me', protect, updateMe);

// ─── Public profiles ──────────────────────────────────────────────────────────
router.get('/:id/public', getPublicProfile);

// ─── Admin — user management ──────────────────────────────────────────────────
router.get('/admin/users',     protect, checkPermission('users:manage'), adminListUsers);
router.patch('/admin/users/:id/role',   protect, checkPermission('users:manage'), adminChangeRole);
router.delete('/admin/users/:id',       protect, checkPermission('users:manage'), adminSoftDeleteUser);
router.get('/admin/analytics',          protect, checkPermission('users:manage'), getAdminAnalytics);

export default router;
