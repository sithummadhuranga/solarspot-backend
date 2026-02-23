import { Request, Response } from 'express';
import mongoose from 'mongoose';
import asyncHandler from '@middleware/asyncHandler';
import * as userService from '@modules/users/user.service';
import ApiResponse from '@utils/ApiResponse';
import logger from '@utils/logger';

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get the authenticated user's full profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: User profile returned. }
 *       401: { description: Unauthorised. }
 *       500: { description: Internal server error. }
 */
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const profile = await userService.getMe((req.user as { _id: string })._id.toString());
  ApiResponse.success(res, profile, 'Profile retrieved');
});

/**
 * @swagger
 * /api/users/me:
 *   put:
 *     tags: [Users]
 *     summary: Update the authenticated user's profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName: { type: string, minLength: 2, maxLength: 50 }
 *               avatarUrl:   { type: string, format: uri }
 *               bio:         { type: string, maxLength: 300 }
 *               preferences: { type: object }
 *     responses:
 *       200: { description: Profile updated. }
 *       401: { description: Unauthorised. }
 *       422: { description: Validation error. }
 *       500: { description: Internal server error. }
 */
export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const updated = await userService.updateMe(
    (req.user as { _id: string })._id.toString(),
    req.body
  );
  ApiResponse.success(res, updated, 'Profile updated');
});

/**
 * @swagger
 * /api/users/{id}/public:
 *   get:
 *     tags: [Users]
 *     summary: Get the public profile of any user
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Public profile returned. }
 *       404: { description: User not found. }
 *       500: { description: Internal server error. }
 */
export const getPublicProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await userService.getPublicProfile(req.params.id as string);
  ApiResponse.success(res, profile, 'Public profile retrieved');
});

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 50 }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [user, moderator, admin] }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *       - in: query
 *         name: isEmailVerified
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [createdAt, displayName] }
 *     responses:
 *       200: { description: Paginated user list. }
 *       401: { description: Unauthorised. }
 *       403: { description: Forbidden. }
 *       500: { description: Internal server error. }
 */
export const adminListUsers = asyncHandler(async (req: Request, res: Response) => {
  const {
    page, limit, sort,
    role, isActive, isEmailVerified, search,
  } = req.query;

  const filters = {
    role: role as string | undefined,
    isActive: isActive !== undefined ? isActive === 'true' : undefined,
    isEmailVerified: isEmailVerified !== undefined ? isEmailVerified === 'true' : undefined,
    search: search as string | undefined,
  };

  const pagination = {
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 10,
    sort: sort as string | undefined,
  };

  const result = await userService.adminListUsers(filters, pagination);

  ApiResponse.paginated(
    res,
    result.users,
    {
      page: result.page,
      limit: pagination.limit,
      total: result.total,
      totalPages: result.totalPages,
      hasNext: result.page < result.totalPages,
      hasPrev: result.page > 1,
    },
    'Users retrieved'
  );
});

/**
 * @swagger
 * /api/admin/users/{id}/role:
 *   patch:
 *     tags: [Admin]
 *     summary: Change a user's role (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { type: string, enum: [user, moderator, admin] }
 *     responses:
 *       200: { description: Role updated. }
 *       400: { description: Invalid role or last admin guard triggered. }
 *       401: { description: Unauthorised. }
 *       403: { description: Forbidden. }
 *       404: { description: User not found. }
 *       500: { description: Internal server error. }
 */
export const adminChangeRole = asyncHandler(async (req: Request, res: Response) => {
  const updated = await userService.adminChangeRole(
    (req.user as { _id: string })._id.toString(),
    req.params.id as string,
    req.body.role
  );
  ApiResponse.success(res, updated, 'Role updated');
});

/**
 * @swagger
 * /api/admin/users/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Soft-delete (deactivate) a user account (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User deactivated. }
 *       400: { description: Cannot delete own account. }
 *       401: { description: Unauthorised. }
 *       403: { description: Forbidden. }
 *       404: { description: User not found. }
 *       500: { description: Internal server error. }
 */
export const adminSoftDeleteUser = asyncHandler(async (req: Request, res: Response) => {
  const result = await userService.adminSoftDeleteUser(
    (req.user as { _id: string })._id.toString(),
    req.params.id as string
  );
  ApiResponse.success(res, null, result.message);
});

/**
 * @swagger
 * /api/admin/analytics:
 *   get:
 *     tags: [Admin]
 *     summary: Platform analytics overview (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Analytics data returned. }
 *       401: { description: Unauthorised. }
 *       403: { description: Forbidden. }
 *       500: { description: Internal server error. }
 */
export const getAdminAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const User = (await import('@modules/users/user.model')).default;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [totalUsers, newUsersThisMonth] = await Promise.all([
    User.countDocuments({ isActive: true }),
    User.countDocuments({ createdAt: { $gte: startOfMonth }, isActive: true }),
  ]);

  let totalStations = 0;
  let pendingStations = 0;
  let totalReviews = 0;
  let pendingReviews = 0;

  try {
    if (mongoose.modelNames().includes('Station')) {
      const Station = mongoose.model('Station');
      [totalStations, pendingStations] = await Promise.all([
        Station.countDocuments({}),
        Station.countDocuments({ status: 'pending' }),
      ]);
    }
  } catch {
    logger.warn('Station model not available for analytics');
  }

  try {
    if (mongoose.modelNames().includes('Review')) {
      const Review = mongoose.model('Review');
      [totalReviews, pendingReviews] = await Promise.all([
        Review.countDocuments({}),
        Review.countDocuments({ status: 'pending' }),
      ]);
    }
  } catch {
    logger.warn('Review model not available for analytics');
  }

  ApiResponse.success(res, {
    totalUsers,
    totalStations,
    totalReviews,
    pendingStations,
    pendingReviews,
    newUsersThisMonth,
  }, 'Analytics retrieved');
});
