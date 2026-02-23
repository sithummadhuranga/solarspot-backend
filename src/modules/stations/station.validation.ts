import Joi from 'joi';
import { CONNECTOR_TYPES, AMENITY_VALUES, DAYS_OF_WEEK } from './station.model';

// ─── Reusable sub-schemas ─────────────────────────────────────────────────────

const connectorSchema = Joi.object({
  type: Joi.string()
    .valid(...CONNECTOR_TYPES)
    .required()
    .messages({
      'any.only': `Connector type must be one of: ${CONNECTOR_TYPES.join(', ')}`,
      'any.required': 'Connector type is required',
    }),
  powerKw: Joi.number().min(0.5).max(350).required().messages({
    'number.min': 'Power must be at least 0.5 kW',
    'number.max': 'Power cannot exceed 350 kW',
    'any.required': 'Connector powerKw is required',
  }),
  count: Joi.number().integer().min(1).required().messages({
    'number.min': 'Connector count must be at least 1',
    'any.required': 'Connector count is required',
  }),
});

const scheduleEntrySchema = Joi.object({
  day: Joi.string()
    .valid(...DAYS_OF_WEEK)
    .required()
    .messages({
      'any.only': `Day must be one of: ${DAYS_OF_WEEK.join(', ')}`,
    }),
  openTime: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .required()
    .messages({
      'string.pattern.base': 'openTime must be in HH:MM format (e.g. 08:00)',
    }),
  closeTime: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .required()
    .messages({
      'string.pattern.base': 'closeTime must be in HH:MM format (e.g. 17:00)',
    }),
});

const operatingHoursSchema = Joi.object({
  alwaysOpen: Joi.boolean().default(false),
  schedule: Joi.when('alwaysOpen', {
    is: false,
    then: Joi.array().items(scheduleEntrySchema).default([]),
    otherwise: Joi.array().items(scheduleEntrySchema).default([]),
  }),
});

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const createStationSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100).required().messages({
    'string.min': 'Station name must be at least 3 characters',
    'string.max': 'Station name cannot exceed 100 characters',
    'any.required': 'Station name is required',
  }),

  description: Joi.string().trim().max(1000).optional().allow('').messages({
    'string.max': 'Description cannot exceed 1000 characters',
  }),

  addressString: Joi.string().trim().min(5).max(300).optional().messages({
    'string.min': 'Address string must be at least 5 characters',
  }),

  lat: Joi.number().min(-90).max(90).optional(),
  lng: Joi.number().min(-180).max(180).optional(),

  connectors: Joi.array().items(connectorSchema).min(1).required().messages({
    'array.min': 'At least one connector is required',
    'any.required': 'Connectors are required',
  }),

  solarPanelKw: Joi.number().min(0.1).max(10000).required().messages({
    'number.min': 'Solar panel capacity must be at least 0.1 kW',
    'number.max': 'Solar panel capacity cannot exceed 10,000 kW',
    'any.required': 'Solar panel capacity is required',
  }),

  amenities: Joi.array()
    .items(Joi.string().valid(...AMENITY_VALUES))
    .default([])
    .messages({
      'any.only': `Amenity must be one of: ${AMENITY_VALUES.join(', ')}`,
    }),

  images: Joi.array().items(Joi.string().uri()).max(5).default([]).messages({
    'array.max': 'Maximum 5 images are allowed',
    'string.uri': 'Each image must be a valid URL',
  }),

  operatingHours: operatingHoursSchema.optional(),
})
  .or('addressString', 'lat') // At least one geocoding source must be provided
  .messages({
    'object.missing': 'Either addressString or lat/lng coordinates must be provided',
  });

export const updateStationSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100).optional().messages({
    'string.min': 'Station name must be at least 3 characters',
    'string.max': 'Station name cannot exceed 100 characters',
  }),

  description: Joi.string().trim().max(1000).optional().allow('').messages({
    'string.max': 'Description cannot exceed 1000 characters',
  }),

  addressString: Joi.string().trim().min(5).max(300).optional(),
  lat: Joi.number().min(-90).max(90).optional(),
  lng: Joi.number().min(-180).max(180).optional(),

  connectors: Joi.array().items(connectorSchema).min(1).optional().messages({
    'array.min': 'At least one connector is required',
  }),

  solarPanelKw: Joi.number().min(0.1).max(10000).optional().messages({
    'number.min': 'Solar panel capacity must be at least 0.1 kW',
    'number.max': 'Solar panel capacity cannot exceed 10,000 kW',
  }),

  amenities: Joi.array()
    .items(Joi.string().valid(...AMENITY_VALUES))
    .optional()
    .messages({
      'any.only': `Amenity must be one of: ${AMENITY_VALUES.join(', ')}`,
    }),

  images: Joi.array().items(Joi.string().uri()).max(5).optional().messages({
    'array.max': 'Maximum 5 images are allowed',
    'string.uri': 'Each image must be a valid URL',
  }),

  operatingHours: operatingHoursSchema.optional(),
}).min(1); // At least one field must be present

export const rejectStationSchema = Joi.object({
  rejectionReason: Joi.string().trim().min(10).max(500).required().messages({
    'string.min': 'Rejection reason must be at least 10 characters',
    'string.max': 'Rejection reason cannot exceed 500 characters',
    'any.required': 'A rejection reason is required',
  }),
});

export const listStationsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(200).optional(),
  lat: Joi.number().min(-90).max(90).optional(),
  lng: Joi.number().min(-180).max(180).optional(),
  radius: Joi.number().min(0.1).max(500).optional().messages({
    'number.max': 'Search radius cannot exceed 500 km',
  }),
  connectorType: Joi.string()
    .valid(...CONNECTOR_TYPES)
    .optional(),
  minRating: Joi.number().min(0).max(5).optional(),
  isVerified: Joi.boolean().optional(),
  amenities: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string().valid(...AMENITY_VALUES)),
      Joi.string().valid(...AMENITY_VALUES)
    )
    .optional(),
  sortBy: Joi.string()
    .valid('newest', 'rating', 'distance', 'featured')
    .default('newest'),
// lat and lng must appear together — one without the other is meaningless
}).and('lat', 'lng');

export const nearbyQuerySchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required().messages({
    'any.required': 'lat is required for nearby search',
  }),
  lng: Joi.number().min(-180).max(180).required().messages({
    'any.required': 'lng is required for nearby search',
  }),
  radius: Joi.number().min(0.1).max(500).default(10).messages({
    'number.max': 'Radius cannot exceed 500 km',
  }),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const searchQuerySchema = Joi.object({
  q: Joi.string().trim().min(2).max(200).required().messages({
    'any.required': 'Search query (q) is required',
    'string.min': 'Search query must be at least 2 characters',
  }),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sortBy: Joi.string().valid('newest', 'rating', 'featured').default('newest'),
});

// Feature toggle has no request body — no schema needed.
// Stats endpoint has no request body either.
// Both are validated at the route level via the :id param (ObjectId guard in the service).
