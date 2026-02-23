/**
 * Permission validation schemas (Joi).
 *
 * TODO: Member 4 — fill in validation rules.
 */

import Joi from 'joi';

// TODO: Member 4 — add objectId helper: const objectId = () => Joi.string().hex().length(24);
//   then uncomment the field rules in each schema below.

/** POST /admin/roles/:id/permissions */
export const assignRolePermSchema = Joi.object({
  // permissionId: objectId().required(),
  // policyIds:    Joi.array().items(objectId()).default([]),
}).options({ stripUnknown: true });

/** POST /admin/users/:id/permissions */
export const overridePermSchema = Joi.object({
  // permissionId: objectId().required(),
  // granted:      Joi.boolean().required(),
  // reason:       Joi.string().trim().max(500),
  // expiresAt:    Joi.date().iso().min('now'),
}).options({ stripUnknown: true });

/** POST /permissions/check */
export const checkPermSchema = Joi.object({
  // action:  Joi.string().required(),   // e.g. 'stations.create'
  // context: Joi.object().default({}),  // arbitrary fields for ABAC conditions
}).options({ stripUnknown: true });

/** GET /admin/audit-logs */
export const auditLogsQuerySchema = Joi.object({
  // page:       Joi.number().integer().min(1).default(1),
  // limit:      Joi.number().integer().min(1).max(100).default(20),
  // actor:      objectId(),
  // action:     Joi.string(),
  // result:     Joi.string().valid('granted', 'denied'),
  // from:       Joi.date().iso(),
  // to:         Joi.date().iso(),
}).options({ stripUnknown: true });
