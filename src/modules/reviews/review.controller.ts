

import { Request, Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import { ROLES }    from '@middleware/rbac.middleware';
import ApiResponse  from '@utils/ApiResponse';
import * as reviewService from './review.service';
import type { CreateReviewInput, UpdateReviewInput, ModerateReviewInput } from '@/types';

type RoleName = keyof typeof ROLES;


export const listReviews = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const { page = '1', limit = '10', stationId, authorId, moderationStatus, sort = 'newest' } = q;

  const { reviews, pagination } = await reviewService.listReviews({
    page: Number(page),
    limit: Number(limit),
    stationId,
    authorId,
    moderationStatus: moderationStatus as 'pending' | 'approved' | 'rejected' | 'flagged' | undefined,
    sort: sort as 'newest' | 'oldest' | 'highest' | 'lowest' | 'helpful',
  });

  return ApiResponse.paginated(res, reviews, pagination, 'Reviews retrieved successfully');
});


export const getReviewById = asyncHandler(async (req: Request, res: Response) => {
  const review = await reviewService.getReviewById(String(req.params.id));
  return ApiResponse.success(res, review, 'Review retrieved successfully');
});


export const createReview = asyncHandler(async (req: Request, res: Response) => {
  const review = await reviewService.createReview(
    req.user!._id,
    req.body as CreateReviewInput,
  );
  return ApiResponse.created(res, review, 'Review created successfully');
});


export const updateReview = asyncHandler(async (req: Request, res: Response) => {
  const review = await reviewService.updateReview(
    String(req.params.id),
    req.user!._id,
    req.body as UpdateReviewInput,
  );
  return ApiResponse.success(res, review, 'Review updated successfully');
});


export const deleteReview = asyncHandler(async (req: Request, res: Response) => {
  const roleLevel = req.user!.roleLevel ?? ROLES[req.user!.role as RoleName] ?? 1;
  const canDeleteAny = roleLevel >= 3;
  await reviewService.deleteReview(String(req.params.id), req.user!._id, canDeleteAny);
  return ApiResponse.noContent(res);
});


export const toggleHelpful = asyncHandler(async (req: Request, res: Response) => {
  const result = await reviewService.toggleHelpful(String(req.params.id), req.user!._id);
  const message = result.action === 'added'
    ? 'Review marked as helpful'
    : 'Helpful vote removed';
  return ApiResponse.success(res, result, message);
});


export const flagReview = asyncHandler(async (req: Request, res: Response) => {
  const result = await reviewService.flagReview(String(req.params.id), req.user!._id);
  return ApiResponse.success(res, result, 'Review flagged successfully');
});


export const listFlaggedReviews = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '10' } = req.query as Record<string, string | undefined>;
  const { reviews, pagination } = await reviewService.listFlaggedReviews(Number(page), Number(limit));
  return ApiResponse.paginated(res, reviews, pagination, 'Flagged reviews retrieved successfully');
});


export const moderateReview = asyncHandler(async (req: Request, res: Response) => {
  const review = await reviewService.moderateReview(
    String(req.params.id),
    req.user!._id,
    req.body as ModerateReviewInput,
  );
  return ApiResponse.success(res, review, `Review ${review.moderationStatus} successfully`);
});
