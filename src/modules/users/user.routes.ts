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


const router = Router();

router.get('/me', protect, getMe);
router.put('/me', protect, updateMe);

router.get('/:id/public', getPublicProfile);

router.get('/admin/users',     protect, checkPermission('users:manage'), adminListUsers);
router.patch('/admin/users/:id/role',   protect, checkPermission('users:manage'), adminChangeRole);
router.delete('/admin/users/:id',       protect, checkPermission('users:manage'), adminSoftDeleteUser);
router.get('/admin/analytics',          protect, checkPermission('users:manage'), getAdminAnalytics);

export default router;
