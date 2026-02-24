/**
 * User validation schemas (Joi).
 *
 * Ref: PROJECT_OVERVIEW.md → Data Models → User
 *      MASTER_PROMPT.md → Validation — Joi + .options({ stripUnknown: true }) Always
 */

import Joi from 'joi';

/** PUT /users/me — partial update, no email/role change allowed */
export const updateMeSchema = Joi.object({
  displayName: Joi.string().trim().min(2).max(80),
}).options({ stripUnknown: true });

/** PUT /users/:id — admin update */
export const adminUpdateUserSchema = Joi.object({
  role: Joi.string().valid(
    'guest', 'user', 'station_owner', 'featured_contributor',
    'trusted_reviewer', 'review_moderator', 'weather_analyst',
    'permission_auditor', 'moderator', 'admin',
  ),
  isActive: Joi.boolean(),
  isBanned: Joi.boolean(),
}).options({ stripUnknown: true });
