

import { Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import ApiResponse  from '@utils/ApiResponse';
import type { AuthRequest } from '@/types';
import UserService from './user.service';


export const getMe = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await UserService.getMe(req.user!._id);
  return ApiResponse.success(res, user, 'Profile fetched');
});


export const updateMe = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await UserService.updateMe(req.user!._id, req.body);
  return ApiResponse.success(res, user, 'Profile updated');
});


export const deleteMe = asyncHandler(async (req: AuthRequest, res: Response) => {
  await UserService.deleteMe(req.user!._id);
  res.clearCookie('refreshToken');
  return ApiResponse.noContent(res);
});


export const getUserById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await UserService.getUserById(String(req.params.id));
  return ApiResponse.success(res, user, 'User fetched');
});


export const listUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await UserService.listUsers(req.query as Record<string, unknown>);
  return ApiResponse.paginated(
    res,
    result.data,
    { page: result.page, limit: result.limit, total: result.total, totalPages: result.pages, hasNext: result.page < result.pages, hasPrev: result.page > 1 },
  );
});


export const adminUpdateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await UserService.adminUpdateUser(String(req.params.id), req.body, req.user!._id);
  return ApiResponse.success(res, user, 'User updated');
});
