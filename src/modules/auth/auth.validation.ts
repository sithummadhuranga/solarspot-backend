/**
 * Auth validation schemas (Joi).
 *
 * TODO: Member 4 — fill in schema rules per PROJECT_OVERVIEW field spec.
 *
 * Ref: PROJECT_OVERVIEW.md → Data Models → User
 *      MASTER_PROMPT.md → Validation — Joi + .options({ stripUnknown: true }) Always
 */

import Joi from 'joi';

/**
 * POST /auth/register
 * TODO: Member 4 — min/max lengths, email format, password complexity
 */
export const registerSchema = Joi.object({
  // name:     Joi.string().trim().min(2).max(60).required(),
  // email:    Joi.string().email().lowercase().required(),
  // password: Joi.string().min(8).max(72).required(),
  // role:     Joi.string().valid(...ASSIGNABLE_ROLES).optional(),
}).options({ stripUnknown: true });

/**
 * POST /auth/login
 * TODO: Member 4
 */
export const loginSchema = Joi.object({
  // email:    Joi.string().email().lowercase().required(),
  // password: Joi.string().required(),
}).options({ stripUnknown: true });

/**
 * POST /auth/forgot-password
 * TODO: Member 4
 */
export const forgotPasswordSchema = Joi.object({
  // email: Joi.string().email().lowercase().required(),
}).options({ stripUnknown: true });

/**
 * PATCH /auth/reset-password/:token
 * TODO: Member 4 — confirm password match
 */
export const resetPasswordSchema = Joi.object({
  // password:        Joi.string().min(8).max(72).required(),
  // confirmPassword: Joi.any().valid(Joi.ref('password')).required(),
}).options({ stripUnknown: true });
