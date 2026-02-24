import { Router } from 'express';
import { protect } from '@middleware/auth.middleware';
import {
  register,
  verifyEmail,
  login,
  logout,
  refresh,
  forgotPassword,
  resetPassword,
} from '@modules/users/auth.controller';

const router = Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user account
 *     description: |
 *       Creates a new user account with email verification requirement.
 *       Sends verification email via Brevo SMTP (300/day quota).
 *       User account is created but isEmailVerified=false until verified.
 *     tags: [Auth]
 *     x-component: auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, displayName]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: SecurePass123!
 *               displayName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 example: John Doe
 *     responses:
 *       201:
 *         description: User registered successfully, verification email sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     email:
 *                       type: string
 *                 message:
 *                   type: string
 *                   example: Registration successful. Please verify your email.
 *       409:
 *         description: Email already registered
 *       422:
 *         description: Validation error
 *       429:
 *         description: Too many registration attempts
 */
router.post('/register', register);

/**
 * @swagger
 * /api/auth/verify-email/{token}:
 *   get:
 *     summary: Verify user email address
 *     description: |
 *       Verifies email using token from registration email.
 *       Sets isEmailVerified=true and sends welcome email.
 *       Token is single-use and expires after 24 hours.
 *     tags: [Auth]
 *     x-component: auth
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Email verification token (random 32-byte hex string)
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired token
 *       404:
 *         description: User not found
 */
router.get('/verify-email/:token', verifyEmail);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with email and password
 *     description: |
 *       Authenticates user and returns JWT access token (15min) and refresh token (7d).
 *       Refresh token set as httpOnly cookie for security.
 *       Rate limited to 10 attempts per 15 minutes per IP.
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
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@solarspot.app
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Admin@2026!
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       description: JWT token (15min expiry)
 *                     user:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         email:
 *                           type: string
 *                         displayName:
 *                           type: string
 *                         role:
 *                           type: string
 *       401:
 *         description: Invalid credentials or account inactive
 *       429:
 *         description: Too many login attempts
 */
router.post('/login', login);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     description: |
 *       Issues new access token using refresh token from httpOnly cookie.
 *       Implements token rotation: old refresh token invalidated, new pair issued.
 *       Prevents replay attacks.
 *     tags: [Auth]
 *     x-component: auth
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', refresh);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     description: |
 *       Sends password reset email with token (1 hour expiry).
 *       Rate limited to 5 requests per hour per email.
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
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Reset email sent (always 200 to prevent email enumeration)
 *       429:
 *         description: Too many reset requests
 */
router.post('/forgot-password', forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password/{token}:
 *   patch:
 *     summary: Reset password with token
 *     description: |
 *       Resets password using token from forgot-password email.
 *       Token is single-use and expires after 1 hour.
 *       Invalidates all existing sessions (refresh tokens).
 *     tags: [Auth]
 *     x-component: auth
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid or expired token
 *       422:
 *         description: Password validation failed
 */
router.patch('/reset-password/:token', resetPassword);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     description: |
 *       Invalidates refresh token in database and clears httpOnly cookie.
 *       Client must discard access token from memory.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     x-component: auth
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         description: Not authenticated
 */
router.post('/logout', protect, logout);

export default router;

