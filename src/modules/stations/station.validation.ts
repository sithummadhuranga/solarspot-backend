import Joi from 'joi';
import { CONNECTOR_TYPES, AMENITY_VALUES, DAYS_OF_WEEK } from './station.model';

const connectorSchema = Joi.object({
  type:    Joi.string().valid(...CONNECTOR_TYPES).required(),
  powerKw: Joi.number().min(0.5).max(350).required(),
  count:   Joi.number().integer().min(1).required(),
});

const scheduleEntrySchema = Joi.object({
  day:       Joi.string().valid(...DAYS_OF_WEEK).required(),
  openTime:  Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  closeTime: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
});

const operatingHoursSchema = Joi.object({
  alwaysOpen: Joi.boolean().default(false),
  schedule:   Joi.array().items(scheduleEntrySchema).default([]),
});

/** POST /api/stations */
export const createStationSchema = Joi.object({
  name:           Joi.string().trim().min(3).max(100).required(),
  description:    Joi.string().trim().max(1000),
  addressString:  Joi.string().trim().max(300),
  lat:            Joi.number().min(-90).max(90),
  lng:            Joi.number().min(-180).max(180),
  connectors:     Joi.array().items(connectorSchema).min(1).required(),
  solarPanelKw:   Joi.number().min(0.1).max(10000).required(),
  amenities:      Joi.array().items(Joi.string().valid(...AMENITY_VALUES)).default([]),
  images:         Joi.array().items(Joi.string().uri()).max(5).default([]),
  operatingHours: operatingHoursSchema,
}).options({ stripUnknown: true });

/** PUT /api/stations/:id */
export const updateStationSchema = Joi.object({
  name:           Joi.string().trim().min(3).max(100),
  description:    Joi.string().trim().max(1000).allow(''),
  addressString:  Joi.string().trim().max(300),
  lat:            Joi.number().min(-90).max(90),
  lng:            Joi.number().min(-180).max(180),
  connectors:     Joi.array().items(connectorSchema).min(1),
  solarPanelKw:   Joi.number().min(0.1).max(10000),
  amenities:      Joi.array().items(Joi.string().valid(...AMENITY_VALUES)),
  images:         Joi.array().items(Joi.string().uri()).max(5),
  operatingHours: operatingHoursSchema,
}).min(1).options({ stripUnknown: true });

/** PATCH /api/stations/:id/reject */
export const rejectStationSchema = Joi.object({
  rejectionReason: Joi.string().trim().min(10).max(500).required(),
}).options({ stripUnknown: true });

/** GET /api/stations (query) */
export const listStationsQuerySchema = Joi.object({
  page:          Joi.number().integer().min(1).default(1),
  limit:         Joi.number().integer().min(1).max(100).default(10),
  search:        Joi.string().trim().max(200),
  lat:           Joi.number().min(-90).max(90),
  lng:           Joi.number().min(-180).max(180),
  radius:        Joi.number().min(1).max(500).default(25),
  connectorType: Joi.string().valid(...CONNECTOR_TYPES),
  minRating:     Joi.number().min(0).max(5),
  isVerified:    Joi.boolean(),
  amenities:     Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()),
  sortBy:        Joi.string().valid('newest', 'rating', 'distance', 'featured').default('newest'),
}).options({ stripUnknown: true });

/** GET /api/stations/nearby (query) */
export const nearbyQuerySchema = Joi.object({
  lat:    Joi.number().min(-90).max(90).required(),
  lng:    Joi.number().min(-180).max(180).required(),
  radius: Joi.number().min(1).max(500).default(10),
  limit:  Joi.number().integer().min(1).max(100).default(20),
}).options({ stripUnknown: true });

/** GET /api/stations/search (query) */
export const searchQuerySchema = Joi.object({
  q:      Joi.string().trim().min(1).max(200).required(),
  page:   Joi.number().integer().min(1).default(1),
  limit:  Joi.number().integer().min(1).max(100).default(10),
  sortBy: Joi.string().valid('newest', 'rating', 'featured').default('newest'),
}).options({ stripUnknown: true });
