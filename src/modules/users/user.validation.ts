

import Joi from 'joi';


export const updateMeSchema = Joi.object({
  displayName: Joi.string().trim().min(2).max(80),
}).options({ stripUnknown: true });


export const adminUpdateUserSchema = Joi.object({
  role: Joi.string().valid(
    'guest', 'user', 'station_owner', 'featured_contributor',
    'trusted_reviewer', 'review_moderator', 'weather_analyst',
    'permission_auditor', 'moderator', 'admin',
  ),
  isActive: Joi.boolean(),
  isBanned: Joi.boolean(),
}).options({ stripUnknown: true });
