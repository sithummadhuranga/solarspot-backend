/**
 * User controller — thin HTTP layer, delegates to UserService.
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Users (6 endpoints)
 *      MASTER_PROMPT.md → Controllers Must Be Thin — no business logic here
 */

import { Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import ApiResponse  from '@utils/ApiResponse';
import type { AuthRequest } from '@/types';
import UserService from './user.service';

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get own profile
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     x-permission: users.read-own
 *     x-component: users
 *     responses:
 *       200:
 *         description: Profile returned
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export const getMe = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await UserService.getMe(req.user!._id);
  return ApiResponse.success(res, user, 'Profile fetched');
});

/**
 * @swagger
 * /api/users/me:
 *   put:
 *     summary: Update own profile
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     x-permission: users.edit-own
 *     x-component: users
 *     responses:
 *       200:
 *         description: Profile updated
 */
export const updateMe = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await UserService.updateMe(req.user!._id, req.body);
  return ApiResponse.success(res, user, 'Profile updated');
});

/**
 * @swagger
 * /api/users/me:
 *   delete:
 *     summary: Soft-delete own account
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     x-permission: users.edit-own
 *     x-component: users
 *     responses:
 *       204:
 *         description: Account deleted
 */
export const deleteMe = asyncHandler(async (req: AuthRequest, res: Response) => {
  await UserService.deleteMe(req.user!._id);
  res.clearCookie('refreshToken');
  return ApiResponse.noContent(res);
});

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get a public user profile by ID
 *     tags: [Users]
 *     x-permission: users.read-public
 *     x-component: users
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User profile returned
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const getUserById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await UserService.getUserById(String(req.params.id));
  return ApiResponse.success(res, user, 'User fetched');
});

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: List all users (admin)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     x-permission: users.read-list
 *     x-min-role: 4
 *     x-component: users
 *     responses:
 *       200:
 *         description: Paginated user list
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export const listUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await UserService.listUsers(req.query as Record<string, unknown>);
  return ApiResponse.paginated(
    res,
    result.data,
    { page: result.page, limit: result.limit, total: result.total, totalPages: result.pages, hasNext: result.page < result.pages, hasPrev: result.page > 1 },
  );
});

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Admin update user (role, isActive, isBanned)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     x-permission: users.manage
 *     x-min-role: 4
 *     x-component: users
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User updated
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export const adminUpdateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await UserService.adminUpdateUser(String(req.params.id), req.body, req.user!._id);
  return ApiResponse.success(res, user, 'User updated');
});
