import { Request, Response } from 'express';
import mongoose from 'mongoose';
import asyncHandler from '@middleware/asyncHandler';
import * as userService from '@modules/users/user.service';
import ApiResponse from '@utils/ApiResponse';
import logger from '@utils/logger';

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const profile = await userService.getMe((req.user as { _id: string })._id.toString());
  ApiResponse.success(res, profile, 'Profile retrieved');
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const updated = await userService.updateMe(
    (req.user as { _id: string })._id.toString(),
    req.body
  );
  ApiResponse.success(res, updated, 'Profile updated');
});

export const getPublicProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await userService.getPublicProfile(req.params.id as string);
  ApiResponse.success(res, profile, 'Public profile retrieved');
});

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

export const adminChangeRole = asyncHandler(async (req: Request, res: Response) => {
  const updated = await userService.adminChangeRole(
    (req.user as { _id: string })._id.toString(),
    req.params.id as string,
    req.body.role
  );
  ApiResponse.success(res, updated, 'Role updated');
});

export const adminSoftDeleteUser = asyncHandler(async (req: Request, res: Response) => {
  const result = await userService.adminSoftDeleteUser(
    (req.user as { _id: string })._id.toString(),
    req.params.id as string
  );
  ApiResponse.success(res, null, result.message);
});

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
