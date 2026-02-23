import { Request, Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import * as authService from '@modules/users/auth.service';
import ApiResponse from '@utils/ApiResponse';

// ─── Cookie config ────────────────────────────────────────────────────────────

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, displayName]
 *             properties:
 *               email:       { type: string, format: email }
 *               password:    { type: string, minLength: 8 }
 *               displayName: { type: string, minLength: 2, maxLength: 50 }
 *     responses:
 *       201: { description: User created. Verification email sent. }
 *       409: { description: Email already registered. }
 *       422: { description: Validation error. }
 *       500: { description: Internal server error. }
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, displayName } = req.body;
  const user = await authService.register(email, password, displayName);
  ApiResponse.created(res, user, 'Registration successful. Please verify your email.');
});

/**
 * @swagger
 * /api/auth/verify-email/{token}:
 *   get:
 *     tags: [Auth]
 *     summary: Verify email address using the token from the verification email
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Email verified. Tokens returned. }
 *       400: { description: Invalid or expired token. }
 *       500: { description: Internal server error. }
 */
export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const token = req.params.token as string;
  const { accessToken, refreshToken, user } = await authService.verifyEmail(token);
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
  ApiResponse.success(res, { accessToken, user }, 'Email verified successfully');
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Login successful. Access token and user returned. }
 *       401: { description: Invalid credentials. }
 *       403: { description: Email not verified or account deactivated. }
 *       500: { description: Internal server error. }
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const { accessToken, refreshToken, user } = await authService.login(email, password);
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
  ApiResponse.success(res, { accessToken, user }, 'Login successful');
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out and invalidate refresh token
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204: { description: Logged out successfully. }
 *       401: { description: Unauthorised. }
 *       500: { description: Internal server error. }
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logout((req.user as { _id: string })._id.toString());
  res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'strict' });
  ApiResponse.noContent(res);
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate refresh token and issue a new access token
 *     description: Reads the refreshToken from the httpOnly cookie.
 *     responses:
 *       200: { description: New access token issued. }
 *       401: { description: Invalid or expired refresh token. }
 *       500: { description: Internal server error. }
 */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const incomingRefreshToken: string | undefined = req.cookies?.refreshToken;
  if (!incomingRefreshToken) {
    res.status(401).json({ success: false, message: 'No refresh token provided' });
    return;
  }
  const { accessToken, refreshToken } = await authService.refreshAccessToken(incomingRefreshToken);
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
  ApiResponse.success(res, { accessToken }, 'Token refreshed');
});

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset email
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
 *       200: { description: Reset link sent if account exists. }
 *       500: { description: Internal server error. }
 */
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  const result = await authService.forgotPassword(email);
  ApiResponse.success(res, null, result.message);
});

/**
 * @swagger
 * /api/auth/reset-password/{token}:
 *   patch:
 *     tags: [Auth]
 *     summary: Reset password using the token from the reset email
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
 *             required: [password]
 *             properties:
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200: { description: Password reset successfully. }
 *       400: { description: Invalid or expired token. }
 *       500: { description: Internal server error. }
 */
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const token = req.params.token as string;
  const { password } = req.body;
  await authService.resetPassword(token, password);
  // Clear any residual refresh cookie
  res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'strict' });
  ApiResponse.success(res, null, 'Password has been reset. Please log in again.');
});
