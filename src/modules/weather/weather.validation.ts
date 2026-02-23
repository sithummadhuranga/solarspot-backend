/**
 * Weather validation schemas (Joi).
 *
 * Owner: Member 3 (Solar Intelligence & Weather).
 *
 * TODO: Member 3 — fill in validation rules.
 */

import Joi from 'joi';

/** POST /admin/weather/refresh */
export const bulkRefreshSchema = Joi.object({
  // stationIds: Joi.array().items(Joi.string().hex().length(24)).min(1).max(100).required(),
}).options({ stripUnknown: true });

/** GET /admin/weather/export */
export const exportQuerySchema = Joi.object({
  // format:    Joi.string().valid('csv', 'json').default('json'),
  // from:      Joi.date().iso(),
  // to:        Joi.date().iso().min(Joi.ref('from')),
  // stationId: Joi.string().hex().length(24),
}).options({ stripUnknown: true });
