

import Joi from 'joi';


const objectId = Joi.string().hex().length(24).messages({
  'string.hex':    '{{#label}} must be a valid ObjectId (hex)',
  'string.length': '{{#label}} must be exactly 24 characters',
});



export const stationIdParamSchema = Joi.object({
  stationId: objectId.required(),
}).options({ stripUnknown: true });



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
