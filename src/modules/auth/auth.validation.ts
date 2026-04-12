

import Joi from 'joi';


export const registerSchema = Joi.object({
  displayName: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().min(8).max(72).required(),
}).options({ stripUnknown: true });


export const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().required(),
}).options({ stripUnknown: true });


export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
}).options({ stripUnknown: true });


export const resetPasswordSchema = Joi.object({
  password: Joi.string().min(8).max(72).required(),
  confirmPassword: Joi.any().valid(Joi.ref('password')).required().messages({
    'any.only': 'Passwords do not match',
  }),
}).options({ stripUnknown: true });
