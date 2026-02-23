/**
 * Review service — business logic layer.
 *
 * TODO: Member 2 — implement all methods.
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Reviews (9 endpoints)
 *      MASTER_PROMPT.md → ACID — compound unique index, post-save hook for averageRating
 */

import type { IReview, CreateReviewInput, ModerateReviewInput, ListReviewsQuery, PaginationResult } from '@/types';
import logger from '@utils/logger';

class ReviewService {
  /** POST /stations/:id/reviews */
  async createReview(_stationId: string, _authorId: string, _input: CreateReviewInput): Promise<IReview> {
    logger.warn('ReviewService.createReview: not yet implemented'); throw new Error('Not implemented');
  }

  /** GET /stations/:id/reviews */
  async listReviewsByStation(_stationId: string, _query: ListReviewsQuery): Promise<PaginationResult<IReview>> {
    logger.warn('ReviewService.listReviewsByStation: not yet implemented'); throw new Error('Not implemented');
  }

  /** GET /reviews/:id */
  async getReviewById(_id: string): Promise<IReview> {
    logger.warn('ReviewService.getReviewById: not yet implemented'); throw new Error('Not implemented');
  }

  /** PATCH /reviews/:id */
  async updateReview(_id: string, _authorId: string, _input: Partial<CreateReviewInput>): Promise<IReview> {
    logger.warn('ReviewService.updateReview: not yet implemented'); throw new Error('Not implemented');
  }

  /** DELETE /reviews/:id — soft-delete */
  async deleteReview(_id: string, _requesterId: string): Promise<void> {
    logger.warn('ReviewService.deleteReview: not yet implemented'); throw new Error('Not implemented');
  }

  /** POST /reviews/:id/like */
  async toggleLike(_id: string, _userId: string): Promise<IReview> {
    logger.warn('ReviewService.toggleLike: not yet implemented'); throw new Error('Not implemented');
  }

  /** PATCH /admin/reviews/:id/moderate */
  async moderateReview(_id: string, _moderatorId: string, _input: ModerateReviewInput): Promise<IReview> {
    logger.warn('ReviewService.moderateReview: not yet implemented'); throw new Error('Not implemented');
  }

  /** GET /admin/reviews — paginated all reviews for admin */
  async adminListReviews(_query: ListReviewsQuery): Promise<PaginationResult<IReview>> {
    logger.warn('ReviewService.adminListReviews: not yet implemented'); throw new Error('Not implemented');
  }

  /** GET /users/me/reviews — own reviews */
  async listMyReviews(_userId: string, _query: ListReviewsQuery): Promise<PaginationResult<IReview>> {
    logger.warn('ReviewService.listMyReviews: not yet implemented'); throw new Error('Not implemented');
  }
}

export default new ReviewService();
