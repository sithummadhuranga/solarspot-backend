/**
 * AuthController — thin HTTP layer. One service call per handler. No business logic.
 *
 * Ref: MASTER_PROMPT.md → Architecture Patterns → Controller → Service → Model
 *      "Controllers must: receive HTTP input → call ONE service method → return ApiResponse"
 */

import { Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import ApiResponse  from '@utils/ApiResponse';
import AuthService  from './auth.service';
import { AuthRequest } from '@/types';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new user account and sends an email verification link.
 *     tags: [Auth]
 *     x-component: auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [displayName, email, password]
 *             properties:
 *               displayName: { type: string, minLength: 2, maxLength: 80 }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       201:
 *         description: Registration successful
 *       409:
 *         description: Email already registered
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
export const register = asyncHandler(async (req, res: Response) => {
  const result = await AuthService.register(req.body);
  return ApiResponse.created(res, result, result.message);
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login and receive access token
 *     description: Returns accessToken in body and sets refreshToken as httpOnly cookie.
 *     tags: [Auth]
 *     x-component: auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
export const login = asyncHandler(async (req, res: Response) => {
  const { accessToken, refreshToken, user } = await AuthService.login(req.body);
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
  return ApiResponse.success(res, { accessToken, user }, 'Login successful');
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout and invalidate refresh token
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     x-component: auth
 *     responses:
 *       204:
 *         description: Logged out successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export const logout = asyncHandler(async (req: AuthRequest, res: Response) => {
  await AuthService.logout(req.user!._id);
  res.clearCookie('refreshToken');
  return ApiResponse.noContent(res);
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token using httpOnly refresh cookie
 *     tags: [Auth]
 *     x-component: auth
 *     responses:
 *       200:
 *         description: New access token issued
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export const refresh = asyncHandler(async (req, res: Response) => {
  const oldRefreshToken: string = req.cookies?.refreshToken;
  if (!oldRefreshToken) {
    return res.status(401).json(ApiResponse.error('UNAUTHORIZED', 'Refresh token missing'));
  }
  const { accessToken, refreshToken } = await AuthService.refresh(oldRefreshToken);
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
  return ApiResponse.success(res, { accessToken }, 'Token refreshed');
});

/**
 * @swagger
 * /api/auth/verify-email/{token}:
 *   get:
 *     summary: Verify email address
 *     tags: [Auth]
 *     x-component: auth
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Email verified
 *       400:
 *         description: Invalid or expired token
 */
export const verifyEmail = asyncHandler(async (req, res: Response) => {
  await AuthService.verifyEmail(String(req.params.token));
  return ApiResponse.success(res, null, 'Email verified successfully. Welcome to SolarSpot!');
});

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     tags: [Auth]
 *     x-component: auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Reset email sent (always 200 to prevent enumeration)
 */
export const forgotPassword = asyncHandler(async (req, res: Response) => {
  await AuthService.forgotPassword(req.body.email);
  return ApiResponse.success(res, null, 'If that email is registered, a reset link has been sent.');
});

/**
 * @swagger
 * /api/auth/reset-password/{token}:
 *   patch:
 *     summary: Reset password using token from email
 *     tags: [Auth]
 *     x-component: auth
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password, confirmPassword]
 *             properties:
 *               password: { type: string, minLength: 8 }
 *               confirmPassword: { type: string }
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 */
export const resetPassword = asyncHandler(async (req, res: Response) => {
  await AuthService.resetPassword(String(req.params.token), req.body.password);
  return ApiResponse.success(res, null, 'Password reset successful. Please log in.');
});
