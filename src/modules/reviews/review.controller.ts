/**
 * Review controller — thin HTTP layer.
 *
 * Owner: Member 2
 * Ref: MASTER_PROMPT.md → Controller → Service → Model (Strict Separation)
 *      One service call per controller method, no business logic here.
 */

import { Request, Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import { ROLES }    from '@middleware/rbac.middleware';
import ApiResponse  from '@utils/ApiResponse';
import * as reviewService from './review.service';
import type { CreateReviewInput, UpdateReviewInput, ModerateReviewInput } from '@/types';

type RoleName = keyof typeof ROLES;

/** GET /api/reviews — list reviews (filterable, paginated) */
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

/** GET /api/reviews/:id — get a single review */
export const getReviewById = asyncHandler(async (req: Request, res: Response) => {
  const review = await reviewService.getReviewById(String(req.params.id));
  return ApiResponse.success(res, review, 'Review retrieved successfully');
});

/** POST /api/reviews — create a review */
export const createReview = asyncHandler(async (req: Request, res: Response) => {
  const review = await reviewService.createReview(
    req.user!._id,
    req.body as CreateReviewInput,
  );
  return ApiResponse.created(res, review, 'Review created successfully');
});

/** PUT /api/reviews/:id — update own review */
export const updateReview = asyncHandler(async (req: Request, res: Response) => {
  const review = await reviewService.updateReview(
    String(req.params.id),
    req.user!._id,
    req.body as UpdateReviewInput,
  );
  return ApiResponse.success(res, review, 'Review updated successfully');
});

/** DELETE /api/reviews/:id — soft-delete review */
export const deleteReview = asyncHandler(async (req: Request, res: Response) => {
  // The RBAC middleware already checked the permission.
  // Moderators (roleLevel >= 3) carry reviews.delete-any and can delete any review.
  // Regular users only carry reviews.delete-own and are blocked on non-owned reviews in the service.
  //
  // req.user.roleLevel is NOT set by protect() — it is absent from the JWT payload.
  // We resolve it from the ROLES constant to avoid always treating roleLevel as undefined.
  const roleLevel = req.user!.roleLevel ?? ROLES[req.user!.role as RoleName] ?? 1;
  const canDeleteAny = roleLevel >= 3;
  await reviewService.deleteReview(String(req.params.id), req.user!._id, canDeleteAny);
  return ApiResponse.noContent(res);
});

/** POST /api/reviews/:id/helpful — toggle helpful vote */
export const toggleHelpful = asyncHandler(async (req: Request, res: Response) => {
  const result = await reviewService.toggleHelpful(String(req.params.id), req.user!._id);
  const message = result.action === 'added'
    ? 'Review marked as helpful'
    : 'Helpful vote removed';
  return ApiResponse.success(res, result, message);
});

/** POST /api/reviews/:id/flag — flag a review */
export const flagReview = asyncHandler(async (req: Request, res: Response) => {
  const result = await reviewService.flagReview(String(req.params.id), req.user!._id);
  return ApiResponse.success(res, result, 'Review flagged successfully');
});

/** GET /api/reviews/flagged — list flagged reviews (moderators) */
export const listFlaggedReviews = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '10' } = req.query as Record<string, string | undefined>;
  const { reviews, pagination } = await reviewService.listFlaggedReviews(Number(page), Number(limit));
  return ApiResponse.paginated(res, reviews, pagination, 'Flagged reviews retrieved successfully');
});

/** PATCH /api/reviews/:id/moderate — moderate (approve/reject) a review */
export const moderateReview = asyncHandler(async (req: Request, res: Response) => {
  const review = await reviewService.moderateReview(
    String(req.params.id),
    req.user!._id,
    req.body as ModerateReviewInput,
  );
  return ApiResponse.success(res, review, `Review ${review.moderationStatus} successfully`);
});
