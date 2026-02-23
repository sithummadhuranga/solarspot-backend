/**
 * Review controller — thin HTTP layer.
 *
 * TODO: Member 2 — uncomment service calls when ReviewService is implemented.
 */

import { Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import ApiResponse  from '@utils/ApiResponse';
import type { AuthRequest } from '@/types';
// import ReviewService from './review.service';

export const createReview = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 2
  // const review = await ReviewService.createReview(req.params.stationId, req.user!._id.toString(), req.body);
  // res.status(201).json(ApiResponse.success(review, 'Review created'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'createReview: not yet implemented'));
});

export const listReviewsByStation = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 2
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'listReviewsByStation: not yet implemented'));
});

export const getReviewById = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 2
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'getReviewById: not yet implemented'));
});

export const updateReview = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 2
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'updateReview: not yet implemented'));
});

export const deleteReview = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 2
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'deleteReview: not yet implemented'));
});

export const toggleLike = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 2
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'toggleLike: not yet implemented'));
});

export const moderateReview = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 2
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'moderateReview: not yet implemented'));
});

export const adminListReviews = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 2
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'adminListReviews: not yet implemented'));
});

export const listMyReviews = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 2
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'listMyReviews: not yet implemented'));
});
