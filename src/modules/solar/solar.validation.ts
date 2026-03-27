/**
 * Solar module — Joi request validation schemas.
 *
 * All schemas use stripUnknown: true (enforced by the validate middleware).
 * Each schema validates the minimum required for the endpoint to function safely.
 *
 * Owner: Member 3 · Ref: SolarIntelligence_Module_Prompt.md → A4
 */

import Joi from 'joi';

// ── Reusable fragments ────────────────────────────────────────────────────────

const mongoId = Joi.string().hex().length(24);

// ── Schemas ───────────────────────────────────────────────────────────────────

export const stationIdParamSchema = Joi.object({
  stationId: mongoId.required().messages({
    'string.length': 'stationId must be a 24-character hex ObjectId',
    'any.required': 'stationId is required',
  }),
});

export const reportIdParamSchema = Joi.object({
  id: mongoId.required().messages({
    'string.length': 'id must be a 24-character hex ObjectId',
    'any.required': 'id is required',
  }),
});

export const createReportSchema = Joi.object({
  stationId: mongoId.required(),

  visitedAt: Joi.date()
    .iso()
    .min(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    .max('now')
    .optional()
    .messages({ 'date.max': 'visitedAt cannot be in the future' }),

  actualOutputKw: Joi.number().min(0).max(500).allow(null).optional(),

  notes: Joi.string().trim().max(500).allow(null, '').optional(),

  isPublic: Joi.boolean().optional(),
});

export const updateReportSchema = Joi.object({
  actualOutputKw: Joi.number().min(0).max(500).allow(null).optional(),
  notes:          Joi.string().trim().max(500).allow(null, '').optional(),
  isPublic:       Joi.boolean().optional(),
}).min(1);   // at least one field required

export const getReportsSchema = Joi.object({
  stationId:   mongoId.optional(),
  userId:      mongoId.optional(),
  submittedBy: mongoId.optional(),

  status: Joi.string().valid('draft', 'published', 'archived').optional(),

  isPublic: Joi.boolean().optional(),

  dateFrom: Joi.date().iso().optional(),
  dateTo:   Joi.date().iso().min(Joi.ref('dateFrom')).optional().messages({
    'date.min': '"dateTo" must be on or after "dateFrom"',
  }),
  from: Joi.date().iso().optional(),
  to:   Joi.date().iso().min(Joi.ref('from')).optional().messages({
    'date.min': '"to" must be on or after "from"',
  }),

  minScore: Joi.number().min(0).max(100).optional(),

  sort: Joi.string()
    .valid('newest', 'oldest', 'highest-score', 'most-accurate', 'score')
    .optional()
    .default('newest'),

  page:  Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(50).optional().default(10),
});
