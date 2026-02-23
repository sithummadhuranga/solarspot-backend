/**
 * User validation schemas (Joi).
 *
 * TODO: Member 4 — fill in rules. All schemas MUST include .options({ stripUnknown: true })
 *
 * Ref: PROJECT_OVERVIEW.md → Data Models → User
 *      MASTER_PROMPT.md → Validation — Joi + .options({ stripUnknown: true }) Always
 */

import Joi from 'joi';

/**
 * PATCH /users/me
 * TODO: Member 4 — all fields optional (partial update), disallow email/role change via this route
 */
export const updateMeSchema = Joi.object({
  // name:     Joi.string().trim().min(2).max(60),
  // avatar:   Joi.string().uri(),
  // phone:    Joi.string().trim(),
}).options({ stripUnknown: true });

/**
 * PATCH /admin/users/:id
 * TODO: Member 4 — allow role + isActive changes; guard SUPER_ADMIN downgrade in service
 */
export const adminUpdateUserSchema = Joi.object({
  // role:     Joi.string().valid(...ASSIGNABLE_ROLES),
  // isActive: Joi.boolean(),
}).options({ stripUnknown: true });
