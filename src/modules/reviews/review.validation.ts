/**
 * Review validation schemas (Joi).
 *
 * TODO: Member 2 — fill in allowable values per PROJECT_OVERVIEW spec.
 */

import Joi from 'joi';

/** POST /stations/:id/reviews */
export const createReviewSchema = Joi.object({
  // rating:  Joi.number().integer().min(1).max(5).required(),
  // title:   Joi.string().trim().max(120),
  // body:    Joi.string().trim().max(2000),
}).options({ stripUnknown: true });

/** PATCH /reviews/:id */
export const updateReviewSchema = Joi.object({
  // rating:  Joi.number().integer().min(1).max(5),
  // title:   Joi.string().trim().max(120),
  // body:    Joi.string().trim().max(2000),
}).options({ stripUnknown: true });

/** PATCH /admin/reviews/:id/moderate */
export const moderateReviewSchema = Joi.object({
  // moderationStatus: Joi.string().valid('approved', 'rejected').required(),
  // moderationNote:   Joi.string().trim().max(500),
}).options({ stripUnknown: true });

/** GET /stations/:id/reviews (query) */
export const listReviewsQuerySchema = Joi.object({
  // page:             Joi.number().integer().min(1).default(1),
  // limit:            Joi.number().integer().min(1).max(50).default(10),
  // moderationStatus: Joi.string().valid('pending','approved','rejected'),
  // sort:             Joi.string().valid('newest','oldest','highest','lowest','helpful'),
}).options({ stripUnknown: true });
