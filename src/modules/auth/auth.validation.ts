/**
 * Auth validation schemas (Joi).
 *
 * Ref: PROJECT_OVERVIEW.md → Data Models → User
 *      MASTER_PROMPT.md → Validation — Joi + .options({ stripUnknown: true }) Always
 */

import Joi from 'joi';

/** POST /auth/register */
export const registerSchema = Joi.object({
  displayName: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().min(8).max(72).required(),
}).options({ stripUnknown: true });

/** POST /auth/login */
export const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().required(),
}).options({ stripUnknown: true });

/** POST /auth/forgot-password */
export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
}).options({ stripUnknown: true });

/** PATCH /auth/reset-password/:token */
export const resetPasswordSchema = Joi.object({
  password: Joi.string().min(8).max(72).required(),
  confirmPassword: Joi.any().valid(Joi.ref('password')).required().messages({
    'any.only': 'Passwords do not match',
  }),
}).options({ stripUnknown: true });
