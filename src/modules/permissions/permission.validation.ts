/**
 * Permission validation schemas (Joi).
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Permissions
 *      MASTER_PROMPT.md → Validation — Joi + .options({ stripUnknown: true }) Always
 */

import Joi from 'joi';

const objectId = () => Joi.string().hex().length(24);

/** POST /admin/roles/:id/permissions */
export const assignRolePermSchema = Joi.object({
  permissionId: objectId().required(),
  policyIds:    Joi.array().items(objectId()).default([]),
}).options({ stripUnknown: true });

/** POST /admin/users/:id/permissions */
export const overridePermSchema = Joi.object({
  permissionId: objectId().required(),
  effect:       Joi.string().valid('grant', 'deny').required(),
  reason:       Joi.string().trim().max(500),
  expiresAt:    Joi.date().iso().min('now'),
}).options({ stripUnknown: true });

/** POST /permissions/check */
export const checkPermSchema = Joi.object({
  action:  Joi.string().required(),
  context: Joi.object().default({}),
}).options({ stripUnknown: true });

/** GET /admin/audit-logs — query string */
export const auditLogsQuerySchema = Joi.object({
  page:     Joi.number().integer().min(1).default(1),
  limit:    Joi.number().integer().min(1).max(100).default(20),
  actor:    objectId(),
  action:   Joi.string(),
  resource: Joi.string(),
  from:     Joi.date().iso(),
  to:       Joi.date().iso(),
}).options({ stripUnknown: true });
