/**
 * User controller — thin HTTP layer, delegates to UserService.
 *
 * TODO: Member 4 — uncomment service calls when UserService methods are implemented.
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Users (6 endpoints)
 *      MASTER_PROMPT.md → Controllers Must Be Thin — no business logic here
 */

import { Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import ApiResponse  from '@utils/ApiResponse';
import type { AuthRequest } from '@/types';
// import UserService from './user.service';

/** GET /users/me — own profile */
export const getMe = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 4
  // const user = await UserService.getMe(req.user!._id.toString());
  // res.status(200).json(ApiResponse.success(user, 'Profile fetched'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'getMe: not yet implemented'));
});

/** PATCH /users/me — update own profile */
export const updateMe = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 4
  // const user = await UserService.updateMe(req.user!._id.toString(), req.body);
  // res.status(200).json(ApiResponse.success(user, 'Profile updated'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'updateMe: not yet implemented'));
});

/** DELETE /users/me — soft-delete own account */
export const deleteMe = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 4
  // await UserService.deleteMe(req.user!._id.toString());
  // res.status(204).send();
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'deleteMe: not yet implemented'));
});

/** GET /admin/users — paginated user list (admin) */
export const listUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  // TODO: Member 4
  // const result = await UserService.listUsers(req.query);
  // res.status(200).json(ApiResponse.success(result, 'Users fetched'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'listUsers: not yet implemented'));
});

/** GET /admin/users/:id — get user by id (admin) */
export const getUserById = asyncHandler(async (req: AuthRequest, res: Response) => {
  // TODO: Member 4
  // const user = await UserService.getUserById(req.params.id);
  // res.status(200).json(ApiResponse.success(user, 'User fetched'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'getUserById: not yet implemented'));
});

/** PATCH /admin/users/:id — admin update (role/isActive) */
export const adminUpdateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  // TODO: Member 4
  // const user = await UserService.adminUpdateUser(req.params.id, req.body);
  // res.status(200).json(ApiResponse.success(user, 'User updated'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'adminUpdateUser: not yet implemented'));
});
