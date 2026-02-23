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

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentication and authorisation endpoints
 */

const router = Router();

// ─── Public ───────────────────────────────────────────────────────────────────
router.post('/register', register);
router.get('/verify-email/:token', verifyEmail);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/forgot-password', forgotPassword);
router.patch('/reset-password/:token', resetPassword);

// ─── Protected ────────────────────────────────────────────────────────────────
router.post('/logout', protect, logout);

export default router;
