

import Joi from 'joi';

const objectId = () => Joi.string().hex().length(24);


export const assignRolePermSchema = Joi.object({
  permissionId: objectId().required(),
  policyIds:    Joi.array().items(objectId()).default([]),
}).options({ stripUnknown: true });


export const overridePermSchema = Joi.object({
  permissionId: objectId().required(),
  effect:       Joi.string().valid('grant', 'deny').required(),
  reason:       Joi.string().trim().max(500),
  expiresAt:    Joi.date().iso().min('now'),
}).options({ stripUnknown: true });


export const checkPermSchema = Joi.object({
  action:  Joi.string().required(),
  context: Joi.object().default({}),
}).options({ stripUnknown: true });


export const auditLogsQuerySchema = Joi.object({
  page:     Joi.number().integer().min(1).default(1),
  limit:    Joi.number().integer().min(1).max(100).default(20),
  actor:    objectId(),
  action:   Joi.string(),
  resource: Joi.string(),
  from:     Joi.date().iso(),
  to:       Joi.date().iso(),
}).options({ stripUnknown: true });
