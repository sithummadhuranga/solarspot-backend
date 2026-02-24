/**
 * Auth routes — 7 endpoints.
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Auth (7 endpoints)
 *      MASTER_PROMPT.md → Route Middleware Order — Always This Exact Sequence
 *      MASTER_PROMPT.md → Security → Rate Limiting (authLimiter on all auth routes)
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect }         from '@middleware/auth.middleware';
import { validate }        from '@middleware/validate.middleware';
import * as AuthController from './auth.controller';
import * as V              from './auth.validation';
import { config }          from '@config/env';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many auth attempts. Try again in 15 minutes.' },
  skipSuccessfulRequests: true,
  skip: () => config.NODE_ENV === 'test',
});

router.post('/register',         authLimiter, validate(V.registerSchema),        AuthController.register);
router.post('/login',            authLimiter, validate(V.loginSchema),            AuthController.login);
router.post('/logout',           protect,                                         AuthController.logout);
router.post('/refresh',                                                            AuthController.refresh);
router.get('/verify-email/:token',                                                AuthController.verifyEmail);
router.post('/forgot-password',  authLimiter, validate(V.forgotPasswordSchema),  AuthController.forgotPassword);
router.patch('/reset-password/:token',       validate(V.resetPasswordSchema),    AuthController.resetPassword);

export default router;
