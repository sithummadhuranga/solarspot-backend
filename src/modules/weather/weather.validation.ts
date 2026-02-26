/**
 * Request validation schemas for the weather module.
 * All schemas strip unknown fields (stripUnknown: true) to prevent parameter pollution.
 *
 * Owner: Member 3 · Ref: MASTER_PROMPT.md → Security → Input Validation
 */

import Joi from 'joi';

// ── Reusable primitives ────────────────────────────────────────────────────────

const objectId = Joi.string().hex().length(24).messages({
  'string.hex':    '{{#label}} must be a valid ObjectId (hex)',
  'string.length': '{{#label}} must be exactly 24 characters',
});

const isoDate = Joi.string()
  .isoDate()
  .messages({ 'string.isoDate': '{{#label}} must be a valid ISO 8601 date string' });

// ── Route params ──────────────────────────────────────────────────────────────

/** Validates the :stationId param on GET /api/weather/:stationId and sub-routes. */
export const stationIdParamSchema = Joi.object({
  stationId: objectId.required(),
}).options({ stripUnknown: true });

// ── Request bodies ─────────────────────────────────────────────────────────────

/**
 * POST /api/weather/bulk-refresh
 *
 * When stationIds is omitted every approved active station is refreshed.
 * Max 100 stations per call — guards against very long-running requests that
 * could exhaust the daily OWM quota in one shot.
 */
export const bulkRefreshSchema = Joi.object({
  stationIds: Joi.array()
    .items(objectId)
    .min(1)
    .max(100)
    .optional()
    .messages({
      'array.min': 'stationIds must contain at least 1 entry',
      'array.max': 'No more than 100 stations can be refreshed in a single request',
    }),
  force: Joi.boolean().default(false),
}).options({ stripUnknown: true });

// ── Query strings ─────────────────────────────────────────────────────────────

/**
 * GET /api/weather/export
 *
 * All params are optional. When a date range is supplied, `to` must be on or
 * after `from` so the DB filter returns a non-empty result set.
 */
export const exportQuerySchema = Joi.object({
  format:    Joi.string().valid('json', 'csv').default('json'),
  stationId: objectId.optional(),
  from:      Joi.date().iso().optional(),
  to:        Joi.date().iso()
    .optional()
    .when('from', { is: Joi.exist(), then: Joi.date().iso().min(Joi.ref('from')) })
    .messages({
      'date.min': '"to" must be on or after "from"',
    }),
}).options({ stripUnknown: true });
