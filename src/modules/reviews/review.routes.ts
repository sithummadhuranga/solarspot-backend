/**
 * Review routes — 9 endpoints.
 *
 * Owner: Member 2
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Reviews
 *      MASTER_PROMPT.md → Route Middleware Order: protect → checkPermission → validate → controller
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect }         from '@middleware/auth.middleware';
import { checkPermission } from '@middleware/rbac.middleware';
import { validate }        from '@middleware/validate.middleware';
import * as ReviewController from './review.controller';
import * as V                from './review.validation';

const router = Router();

// Stricter limit for review creation — prevents spam and abuse
const reviewCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max:      10,               // 10 reviews per user per hour across all stations
  standardHeaders: true,
  legacyHeaders:  false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { success: false, message: 'Too many reviews submitted. Please try again later.' },
});

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Review and rating management
 */

/**
 * @swagger
 * /api/reviews:
 *   get:
 *     summary: List reviews (paginated, filterable by station and author)
 *     tags: [Reviews]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 50 }
 *       - in: query
 *         name: stationId
 *         schema: { type: string }
 *         description: Filter reviews by station ID
 *       - in: query
 *         name: authorId
 *         schema: { type: string }
 *         description: Filter reviews by author user ID
 *       - in: query
 *         name: moderationStatus
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, flagged]
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, oldest, highest, lowest, helpful]
 *           default: newest
 *     responses:
 *       200:
 *         description: Paginated list of reviews
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *     x-permission: reviews.read
 *     x-component: reviews
 */
router.get('/',
  validate(V.listReviewsQuerySchema, 'query'),
  ReviewController.listReviews,
);

/**
 * @swagger
 * /api/reviews/flagged:
 *   get:
 *     summary: List flagged reviews for moderation
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 50 }
 *     responses:
 *       200:
 *         description: Paginated list of flagged reviews
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — insufficient permissions
 *     x-permission: reviews.read-flagged
 *     x-roles: [review_moderator, moderator, admin]
 *     x-min-role: 3
 *     x-component: reviews
 */
router.get('/flagged',
  protect,
  checkPermission('reviews.read-flagged'),
  validate(V.listFlaggedQuerySchema, 'query'),
  ReviewController.listFlaggedReviews,
);

/**
 * @swagger
 * /api/reviews/{id}:
 *   get:
 *     summary: Get a single review by ID
 *     tags: [Reviews]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Review ObjectId
 *     responses:
 *       200:
 *         description: Review document
 *       404:
 *         description: Review not found
 *     x-permission: reviews.read
 *     x-component: reviews
 */
router.get('/:id', ReviewController.getReviewById);

/**
 * @swagger
 * /api/reviews:
 *   post:
 *     summary: Create a review for a station
 *     description: |
 *       Submits a review. Content is screened by the Perspective API for toxicity:
 *       - score < 0.60 → auto-approved
 *       - score 0.60–0.79 → held pending human review
 *       - score ≥ 0.80 → auto-rejected
 *       - API unavailable → approved by default (flagged internally for manual check)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [station, rating, content]
 *             properties:
 *               station:
 *                 type: string
 *                 description: Station ObjectId
 *                 example: 507f1f77bcf86cd799439011
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 4
 *               title:
 *                 type: string
 *                 maxLength: 120
 *                 example: Great charging experience
 *               content:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 2000
 *                 example: Excellent solar charging station with fast connectors and friendly staff.
 *     responses:
 *       201:
 *         description: Review created (moderationStatus reflects toxicity screening result)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — cannot review own station
 *       404:
 *         description: Station not found
 *       409:
 *         description: Already reviewed this station
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         description: Too many reviews submitted — rate limit exceeded
 *     x-permission: reviews.create
 *     x-policies: [email_verified_only, active_account_only, one_review_per_station, not_own_station]
 *     x-roles: [user, station_owner, trusted_reviewer, moderator, admin]
 *     x-min-role: 1
 *     x-component: reviews
 */
router.post('/',
  reviewCreateLimiter,
  protect,
  checkPermission('reviews.create'),
  validate(V.createReviewSchema),
  ReviewController.createReview,
);

/**
 * @swagger
 * /api/reviews/{id}:
 *   put:
 *     summary: Update own review
 *     tags: [Reviews]
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
 *             properties:
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               title:
 *                 type: string
 *                 maxLength: 120
 *               content:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 2000
 *     responses:
 *       200:
 *         description: Updated review
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not the review author
 *       404:
 *         description: Review not found
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *     x-permission: reviews.edit-own
 *     x-policies: [owner_match_review, email_verified_only]
 *     x-roles: [user, station_owner, trusted_reviewer, moderator, admin]
 *     x-min-role: 1
 *     x-component: reviews
 *     x-owner-field: author
 */
router.put('/:id',
  protect,
  checkPermission('reviews.edit-own'),
  validate(V.updateReviewSchema),
  ReviewController.updateReview,
);

/**
 * @swagger
 * /api/reviews/{id}:
 *   delete:
 *     summary: Soft-delete a review (own or any for moderators)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Review deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not the review author
 *       404:
 *         description: Review not found
 *     x-permission: reviews.delete-own
 *     x-policies: [owner_match_review]
 *     x-roles: [user, station_owner, trusted_reviewer, review_moderator, moderator, admin]
 *     x-min-role: 1
 *     x-component: reviews
 *     x-owner-field: author
 */
router.delete('/:id',
  protect,
  checkPermission('reviews.delete-own'),
  ReviewController.deleteReview,
);

/**
 * @swagger
 * /api/reviews/{id}/helpful:
 *   post:
 *     summary: Toggle helpful vote on a review
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Helpful vote toggled
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — cannot vote on own review
 *       404:
 *         description: Review not found
 *     x-permission: reviews.helpful
 *     x-policies: [no_self_vote, email_verified_only]
 *     x-roles: [user, station_owner, trusted_reviewer, moderator, admin]
 *     x-min-role: 1
 *     x-component: reviews
 */
router.post('/:id/helpful',
  protect,
  checkPermission('reviews.helpful'),
  ReviewController.toggleHelpful,
);

/**
 * @swagger
 * /api/reviews/{id}/flag:
 *   post:
 *     summary: Flag a review for moderation
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *                 example: Inappropriate content
 *     responses:
 *       200:
 *         description: Review flagged
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — cannot flag own review
 *       404:
 *         description: Review not found
 *       409:
 *         description: Already flagged this review
 *     x-permission: reviews.flag
 *     x-policies: [email_verified_only]
 *     x-roles: [user, station_owner, trusted_reviewer, moderator, admin]
 *     x-min-role: 1
 *     x-component: reviews
 */
router.post('/:id/flag',
  protect,
  checkPermission('reviews.flag'),
  validate(V.flagReviewSchema),
  ReviewController.flagReview,
);

/**
 * @swagger
 * /api/reviews/{id}/moderate:
 *   patch:
 *     summary: Moderate a review (approve or reject)
 *     tags: [Reviews]
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
 *             required: [moderationStatus]
 *             properties:
 *               moderationStatus:
 *                 type: string
 *                 enum: [approved, rejected]
 *                 example: approved
 *               moderationNote:
 *                 type: string
 *                 maxLength: 500
 *                 example: Content verified and approved
 *     responses:
 *       200:
 *         description: Review moderated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — insufficient permissions
 *       404:
 *         description: Review not found
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *     x-permission: reviews.moderate
 *     x-roles: [review_moderator, moderator, admin]
 *     x-min-role: 3
 *     x-component: reviews
 */
router.patch('/:id/moderate',
  protect,
  checkPermission('reviews.moderate'),
  validate(V.moderateReviewSchema),
  ReviewController.moderateReview,
);

export default router;
