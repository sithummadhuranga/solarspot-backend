/**
 * Auth routes — 7 endpoints.
 *
 * TODO: Member 4 — uncomment middleware chain and controller imports when implemented.
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Auth (7 endpoints)
 *      MASTER_PROMPT.md → Route Middleware Order — Always This Exact Sequence
 *      MASTER_PROMPT.md → Security → Rate Limiting (authLimiter on all auth routes)
 *      MASTER_PROMPT.md → Swagger Documentation — Mandatory on Every Endpoint
 */

import { Router } from 'express';
// import { protect }         from '@middleware/auth.middleware';
// import { validate }        from '@middleware/validate.middleware';
// import * as AuthController from './auth.controller';
// import * as V              from './auth.validation';

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     x-component: auth
 *     x-owner: member4
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterInput'
 *     responses:
 *       201:
 *         description: Registration successful — verify email sent
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         description: Email already registered
 */
// router.post('/register', authLimiter, validate(V.registerSchema), AuthController.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login and receive access token
 *     tags: [Auth]
 *     x-component: auth
 *     x-owner: member4
 */
// router.post('/login', authLimiter, validate(V.loginSchema), AuthController.login);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout (invalidate refresh token)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     x-component: auth
 *     x-owner: member4
 */
// router.post('/logout', protect, AuthController.logout);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token using httpOnly refresh cookie
 *     tags: [Auth]
 *     x-component: auth
 *     x-owner: member4
 */
// router.post('/refresh', AuthController.refresh);

/**
 * @swagger
 * /auth/verify-email/{token}:
 *   get:
 *     summary: Verify email address
 *     tags: [Auth]
 *     x-component: auth
 *     x-owner: member4
 */
// router.get('/verify-email/:token', AuthController.verifyEmail);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset email
 *     tags: [Auth]
 *     x-component: auth
 *     x-owner: member4
 */
// router.post('/forgot-password', authLimiter, validate(V.forgotPasswordSchema), AuthController.forgotPassword);

/**
 * @swagger
 * /auth/reset-password/{token}:
 *   patch:
 *     summary: Reset password using token from email
 *     tags: [Auth]
 *     x-component: auth
 *     x-owner: member4
 */
// router.patch('/reset-password/:token', protect, validate(V.resetPasswordSchema), AuthController.resetPassword);

export default router;
