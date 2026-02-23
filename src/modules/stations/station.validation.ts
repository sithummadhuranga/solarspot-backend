/**
 * Station validation schemas (Joi).
 *
 * TODO: Member 1 — fill in rules per PROJECT_OVERVIEW field spec for stations.
 */

import Joi from 'joi';

/** POST /stations */
export const createStationSchema = Joi.object({
  // name:        Joi.string().trim().min(3).max(120).required(),
  // description: Joi.string().trim().max(1000),
  // type:        Joi.string().valid('charging', 'solar_panel').required(),
  // location: Joi.object({
  //   coordinates: Joi.array().items(Joi.number()).length(2).required(), // [lng, lat]
  // }).required(),
  // address: Joi.object({ street: Joi.string(), city: Joi.string(), state: Joi.string(), country: Joi.string(), zip: Joi.string() }),
  // images: Joi.array().items(Joi.string().uri()).max(10),
  // ── Type-specific fields appended by discriminator (Member 1) ──────────────
}).options({ stripUnknown: true });

/** PATCH /stations/:id */
export const updateStationSchema = Joi.object({
  // All fields from createStationSchema, all optional
}).options({ stripUnknown: true });

/** GET /stations (query params) */
export const listStationsQuerySchema = Joi.object({
  // page:    Joi.number().integer().min(1).default(1),
  // limit:   Joi.number().integer().min(1).max(100).default(20),
  // type:    Joi.string().valid('charging', 'solar_panel'),
  // status:  Joi.string().valid('active','inactive','maintenance','pending_review'),
  // city:    Joi.string().trim(),
  // search:  Joi.string().trim(),
}).options({ stripUnknown: true });

/** GET /stations/nearby (query params) */
export const nearbyStationsQuerySchema = Joi.object({
  // lat:     Joi.number().min(-90).max(90).required(),
  // lng:     Joi.number().min(-180).max(180).required(),
  // radius:  Joi.number().min(100).max(50000).default(5000), // metres
  // type:    Joi.string().valid('charging', 'solar_panel'),
}).options({ stripUnknown: true });

/** PATCH /admin/stations/:id/reject */
export const rejectStationSchema = Joi.object({
  // reason: Joi.string().trim().min(10).max(500).required(),
}).options({ stripUnknown: true });
