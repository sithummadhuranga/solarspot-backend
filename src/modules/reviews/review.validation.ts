

import Joi from 'joi';


export const createReviewSchema = Joi.object({
  station: Joi.string().trim().required().messages({
    'string.empty': 'Station ID is required',
    'any.required': 'Station ID is required',
  }),
  rating:  Joi.number().integer().min(1).max(5).required().messages({
    'number.min': 'Rating must be between 1 and 5',
    'number.max': 'Rating must be between 1 and 5',
    'any.required': 'Rating is required',
  }),
  title:   Joi.string().trim().max(120).allow('').optional(),
  content: Joi.string().trim().min(10).max(2000).required().messages({
    'string.min': 'Review content must be at least 10 characters',
    'string.max': 'Review content must not exceed 2000 characters',
    'any.required': 'Review content is required',
  }),
}).options({ stripUnknown: true });


export const updateReviewSchema = Joi.object({
  rating:  Joi.number().integer().min(1).max(5).optional(),
  title:   Joi.string().trim().max(120).allow('').optional(),
  content: Joi.string().trim().min(10).max(2000).optional(),
}).min(1).options({ stripUnknown: true });


export const moderateReviewSchema = Joi.object({
  moderationStatus: Joi.string().valid('approved', 'rejected').required().messages({
    'any.only': 'Moderation status must be "approved" or "rejected"',
    'any.required': 'Moderation status is required',
  }),
  moderationNote: Joi.string().trim().max(500).optional(),
}).options({ stripUnknown: true });


export const flagReviewSchema = Joi.object({
  reason: Joi.string().trim().max(500).optional(),
}).options({ stripUnknown: true });


export const listReviewsQuerySchema = Joi.object({
  page:             Joi.number().integer().min(1).default(1),
  limit:            Joi.number().integer().min(1).max(50).default(10),
  stationId:        Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).optional().messages({
    'string.pattern.base': 'stationId must be a valid ObjectId',
  }),
  authorId:         Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).optional().messages({
    'string.pattern.base': 'authorId must be a valid ObjectId',
  }),
  moderationStatus: Joi.string().valid('pending', 'approved', 'rejected', 'flagged').optional(),
  sort:             Joi.string().valid('newest', 'oldest', 'highest', 'lowest', 'helpful').default('newest'),
}).options({ stripUnknown: true });


export const listFlaggedQuerySchema = Joi.object({
  page:  Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(10),
}).options({ stripUnknown: true });
