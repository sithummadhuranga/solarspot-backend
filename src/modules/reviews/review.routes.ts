

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect }         from '@middleware/auth.middleware';
import { checkPermission, loadResource } from '@middleware/rbac.middleware';
import { Review }          from './review.model';
import { validate }        from '@middleware/validate.middleware';
import * as ReviewController from './review.controller';
import * as V                from './review.validation';

const router = Router();

const reviewCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max:      10,               // 10 reviews per user per hour across all stations
  standardHeaders: true,
  legacyHeaders:  false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { success: false, message: 'Too many reviews submitted. Please try again later.' },
});




router.get('/',
  validate(V.listReviewsQuerySchema, 'query'),
  ReviewController.listReviews,
);


router.get('/flagged',
  protect,
  checkPermission('reviews.read-flagged'),
  validate(V.listFlaggedQuerySchema, 'query'),
  ReviewController.listFlaggedReviews,
);


router.get('/:id', ReviewController.getReviewById);


router.post('/',
  reviewCreateLimiter,
  protect,
  checkPermission('reviews.create'),
  validate(V.createReviewSchema),
  ReviewController.createReview,
);


router.put('/:id',
  protect,
  loadResource(Review),
  checkPermission('reviews.edit-own'),
  validate(V.updateReviewSchema),
  ReviewController.updateReview,
);


router.delete('/:id',
  protect,
  loadResource(Review),
  checkPermission('reviews.delete-own'),
  ReviewController.deleteReview,
);


router.post('/:id/helpful',
  protect,
  loadResource(Review),
  checkPermission('reviews.helpful'),
  ReviewController.toggleHelpful,
);


router.post('/:id/flag',
  protect,
  checkPermission('reviews.flag'),
  validate(V.flagReviewSchema),
  ReviewController.flagReview,
);


router.patch('/:id/moderate',
  protect,
  checkPermission('reviews.moderate'),
  validate(V.moderateReviewSchema),
  ReviewController.moderateReview,
);

export default router;
