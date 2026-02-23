/**
 * Review routes — 9 endpoints.
 *
 * TODO: Member 2 — uncomment route registrations.
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Reviews
 *      MASTER_PROMPT.md → Route Middleware Order: protect → checkPermission → validate → controller
 */

import { Router } from 'express';
// import { protect }           from '@middleware/auth.middleware';
// import { checkPermission }   from '@middleware/rbac.middleware';
// import { validate }          from '@middleware/validate.middleware';
// import * as ReviewController from './review.controller';
// import * as V                from './review.validation';

const router = Router({ mergeParams: true }); // mergeParams for /stations/:stationId/reviews

// ─── Station-scoped ─────────────────────────────────────────────────────────
// router.get('/',    ReviewController.listReviewsByStation);
// router.post('/',   protect, validate(V.createReviewSchema),  ReviewController.createReview);

// ─── Review-scoped ──────────────────────────────────────────────────────────
// router.get('/:id',     ReviewController.getReviewById);
// router.patch('/:id',   protect, validate(V.updateReviewSchema), ReviewController.updateReview);
// router.delete('/:id',  protect, ReviewController.deleteReview);
// router.post('/:id/like', protect, ReviewController.toggleLike);

// ─── Admin ───────────────────────────────────────────────────────────────────
// router.get('/admin/reviews',             protect, checkPermission('reviews.list'),     ReviewController.adminListReviews);
// router.patch('/admin/reviews/:id/moderate', protect, checkPermission('reviews.moderate'), ReviewController.moderateReview);

// ─── Own reviews (mount under /users/me/reviews in app.ts) ───────────────────
// router.get('/me/reviews', protect, ReviewController.listMyReviews);

export default router;
