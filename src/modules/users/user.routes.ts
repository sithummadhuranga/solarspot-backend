import { Router } from 'express';
import { protect } from '@middleware/auth.middleware';
import { checkPermission } from '@middleware/rbac.middleware';
import {
  getMe,
  updateMe,
  deleteMe,
  getPublicProfile,
  adminListUsers,
  adminChangeRole,
  adminSoftDeleteUser,
  getAdminAnalytics,
} from '@modules/users/user.controller';


const router = Router();

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get own profile
 *     description: |
 *       Returns authenticated user's full profile including:
 *       - Personal info (email, displayName, avatar, bio)
 *       - Role and verification status
 *       - Station and review counts (cross-module)
 *       - Preferences
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     x-permission: users.read-own
 *     x-component: users
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *       401:
 *         description: Not authenticated
 */
router.get('/me', protect, getMe);

/**
 * @swagger
 * /api/users/me:
 *   put:
 *     summary: Update own profile
 *     description: |
 *       Updates authenticated user's profile.
 *       Allowed fields: displayName, avatarUrl, bio, preferences.
 *       Email and role changes require admin.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     x-permission: users.edit-own
 *     x-component: users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *               avatarUrl:
 *                 type: string
 *                 format: uri
 *                 nullable: true
 *               bio:
 *                 type: string
 *                 maxLength: 300
 *                 nullable: true
 *               preferences:
 *                 type: object
 *                 properties:
 *                   defaultRadius:
 *                     type: number
 *                   connectorTypes:
 *                     type: array
 *                     items:
 *                       type: string
 *                   emailNotifications:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         description: Not authenticated
 *       422:
 *         description: Validation error
 */
router.put('/me', protect, updateMe);

/**
 * @swagger
 * /api/users/me:
 *   delete:
 *     summary: Delete own account (self-delete)
 *     description: |
 *       Soft-deletes authenticated user's account.
 *       Sets isActive=false, anonymizes email, invalidates tokens.
 *       User's stations and reviews remain visible but attributed to [deleted].
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     x-permission: users.edit-own
 *     x-component: users
 *     responses:
 *       200:
 *         description: Account deactivated successfully
 *       401:
 *         description: Not authenticated
 */
router.delete('/me', protect, deleteMe);

/**
 * @swagger
 * /api/users/{id}/public:
 *   get:
 *     summary: Get public user profile
 *     description: |
 *       Returns public profile for any user (no auth required).
 *       Shows: displayName, avatar, bio, join date, station/review counts.
 *       Email and other sensitive fields not exposed.
 *     tags: [Users]
 *     x-permission: users.read-public
 *     x-component: users
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID (MongoDB ObjectId)
 *     responses:
 *       200:
 *         description: Public profile retrieved
 *       404:
 *         description: User not found or inactive
 */
router.get('/:id/public', getPublicProfile);

/**
 * @swagger
 * /api/users/admin/users:
 *   get:
 *     summary: List all users (admin only)
 *     description: |
 *       Paginated user list with filtering and search.
 *       Filters: role, isActive, isEmailVerified, search (email/displayName).
 *       Sort: createdAt (default), displayName.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     x-permission: users.manage
 *     x-roles: [admin]
 *     x-min-role: 4
 *     x-component: users
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [user, moderator, admin]
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: isEmailVerified
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, displayName]
 *     responses:
 *       200:
 *         description: Users retrieved successfully (paginated)
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.get('/admin/users',     protect, checkPermission('users.manage'), adminListUsers);

/**
 * @swagger
 * /api/users/admin/users/{id}/role:
 *   patch:
 *     summary: Change user role (admin only)
 *     description: |
 *       Changes a user's role. Restrictions:
 *       - Cannot change own role
 *       - Cannot demote last admin
 *       - Triggers permission cache flush
 *       - Sends notification email
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     x-permission: users.manage
 *     x-roles: [admin]
 *     x-min-role: 4
 *     x-component: users
 *     x-policies: [admin_protection]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, moderator, admin]
 *     responses:
 *       200:
 *         description: Role changed successfully
 *       400:
 *         description: Cannot change own role or demote last admin
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 */
router.patch('/admin/users/:id/role',   protect, checkPermission('users.manage'), adminChangeRole);

/**
 * @swagger
 * /api/users/admin/users/{id}:
 *   delete:
 *     summary: Delete user account (admin only)
 *     description: |
 *       Soft-deletes a user account (admin operation).
 *       Sets isActive=false, anonymizes email, invalidates tokens.
 *       Cannot delete own account (use DELETE /me instead).
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     x-permission: users.manage
 *     x-roles: [admin]
 *     x-min-role: 4
 *     x-component: users
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       400:
 *         description: Cannot delete own account
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 */
router.delete('/admin/users/:id',       protect, checkPermission('users.manage'), adminSoftDeleteUser);

/**
 * @swagger
 * /api/users/admin/analytics:
 *   get:
 *     summary: Get platform analytics (admin only)
 *     description: |
 *       Returns platform-wide statistics:
 *       - Total users, stations, reviews
 *       - Pending moderation counts
 *       - New users this month
 *       Cross-module safe: returns 0 if Station/Review models not loaded.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     x-permission: users.manage
 *     x-roles: [admin]
 *     x-min-role: 4
 *     x-component: users
 *     responses:
 *       200:
 *         description: Analytics retrieved successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.get('/admin/analytics',          protect, checkPermission('users.manage'), getAdminAnalytics);

export default router;

