/**
 * AuthService — register, login, logout, token refresh, email verification, password reset.
 *
 * Ref: PROJECT_OVERVIEW.md → Authentication Flow
 *      PROJECT_OVERVIEW.md → API Endpoints → Auth (7 endpoints)
 *      MASTER_PROMPT.md → ACID → Atomicity (register touches users + quota_usage)
 *      MASTER_PROMPT.md → ACID → Isolation (refresh token rotation)
 *
 * Rules:
 *   - accessToken: lives in Redux memory only. Never localStorage.
 *   - refreshToken: lives in httpOnly cookie only. Never accessible to JS.
 *   - Token rotation: findOneAndUpdate matching on OLD token (race-condition safe)
 *   - bcrypt rounds: 12 (handled by User model pre-save hook)
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '@config/env';
import { container } from '@/container';
import { User } from '@modules/users/user.model';
import { Role } from '@modules/permissions/role.model';
import ApiError from '@utils/ApiError';
import logger from '@utils/logger';
import { CreateUserInput, LoginInput } from '@/types';

const ACCESS_TOKEN_EXPIRY = config.JWT_ACCESS_EXPIRES;
const REFRESH_TOKEN_EXPIRY = config.JWT_REFRESH_EXPIRES;
const EMAIL_VERIFY_EXPIRY_HOURS = 24;
const PASSWORD_RESET_EXPIRY_MINUTES = 60;

function generateAccessToken(userId: string): string {
  // jsonwebtoken@9 types incorrectly require `number` for `expiresIn` when using string
  // duration values ('15m', '7d'). The library accepts strings at runtime — this is a
  // known upstream type defect (DefinitelyTyped#55030). The values are validated
  // duration strings from env.ts, so the cast is safe.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign({ id: userId }, config.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY } as any);
}

function generateRefreshToken(userId: string): string {
  // See generateAccessToken — same upstream jsonwebtoken@9 type defect for string durations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign({ id: userId }, config.JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY } as any);
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export class AuthService {
  /**
   * POST /api/auth/register
   * Hash password (via User model pre-save) → save user → send verify-email
   */
  async register(input: CreateUserInput): Promise<{ message: string }> {
    const { displayName, email, password } = input;

    // Service-level check before hitting the DB unique index
    const existing = await User.findOne({ email: email.toLowerCase() }).lean();
    if (existing) {
      throw new ApiError(409, 'An account with this email already exists', ['Email already registered']);
    }

    // Load the default 'user' role
    const defaultRole = await Role.findOne({ name: 'user', isActive: true }).lean();
    if (!defaultRole) {
      throw new ApiError(500, 'Default role not found — run seed:core first');
    }

    const emailVerifyToken = generateSecureToken();
    const emailVerifyExpires = new Date(Date.now() + EMAIL_VERIFY_EXPIRY_HOURS * 60 * 60 * 1000);

    const session = await mongoose.startSession();
    let createdUserId!: import('mongoose').Types.ObjectId;

    try {
      await session.withTransaction(async () => {
        const [newUser] = await User.create(
          [
            {
              displayName,
              email: email.toLowerCase(),
              password,
              role: defaultRole._id,
              emailVerifyToken,
              emailVerifyExpires,
            },
          ],
          { session },
        );
        createdUserId = newUser._id;
      });
    } finally {
      await session.endSession();
    }

    // Email is sent outside the transaction — failure doesn't roll back the user
    const verifyUrl = `${config.APP_URL}/verify-email/${emailVerifyToken}`;
    container.emailService
      .sendVerifyEmail({ _id: createdUserId, displayName, email }, verifyUrl)
      .catch(err => logger.error('AuthService: verify email failed to send', err));

    return { message: 'Registration successful. Please check your email to verify your account.' };
  }

  /**
   * POST /api/auth/login
   * Compare password → generate accessToken (15min) + refreshToken (7d)
   * → return { accessToken, refreshToken, user }
   */
  async login(input: LoginInput): Promise<{ accessToken: string; refreshToken: string; user: object }> {
    const { email, password } = input;

    // Load user with password (select:false by default)
    const user = await User.findOne({ email: email.toLowerCase(), isActive: true })
      .select('+password')
      .populate('role');

    if (!user) {
      throw new ApiError(401, 'Invalid email or password');
    }

    if (user.isBanned) {
      throw new ApiError(403, 'This account has been suspended');
    }

    if (!user.isEmailVerified) {
      throw new ApiError(401, 'Please verify your email address before logging in');
    }

    const passwordMatches = await user.comparePassword(password);
    if (!passwordMatches) {
      throw new ApiError(401, 'Invalid email or password');
    }

    const accessToken = generateAccessToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString());

    // Store refresh token atomically
    await User.findByIdAndUpdate(user._id, { $set: { refreshToken } });

    return {
      accessToken,
      refreshToken,
      user: user.toJSON(),
    };
  }

  /**
   * POST /api/auth/logout
   * Invalidate refreshToken in DB → done.
   */
  async logout(userId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, { $unset: { refreshToken: 1 } });
  }

  /**
   * POST /api/auth/refresh
   * Verify old refresh token → rotate: invalidate old, issue new pair.
   * Uses findOneAndUpdate matching on OLD token — race-condition safe (Isolation rule).
   */
  async refresh(oldRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    let decoded: { id: string };

    try {
      decoded = jwt.verify(oldRefreshToken, config.JWT_SECRET) as { id: string };
    } catch {
      throw new ApiError(401, 'Invalid or expired refresh token');
    }

    const newRefreshToken = generateRefreshToken(decoded.id);

    // Rotate: match on OLD token value — ensures only one rotation wins if two requests race
    const user = await User.findOneAndUpdate(
      { _id: decoded.id, refreshToken: oldRefreshToken },
      { $set: { refreshToken: newRefreshToken } },
      { new: true },
    );

    if (!user) {
      throw new ApiError(401, 'Refresh token has already been rotated or is invalid');
    }

    const accessToken = generateAccessToken(decoded.id);
    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * GET /api/auth/verify-email/:token
   * Verify token → mark isEmailVerified = true → send welcome email.
   */
  async verifyEmail(token: string): Promise<void> {
    const user = await User.findOne({
      emailVerifyToken: token,
      emailVerifyExpires: { $gt: new Date() },
      isEmailVerified: false,
    }).select('+emailVerifyToken +emailVerifyExpires');

    if (!user) {
      throw new ApiError(400, 'Verification link is invalid or has expired');
    }

    user.isEmailVerified = true;
    user.emailVerifyToken = undefined;
    user.emailVerifyExpires = undefined;
    await user.save();

    container.emailService
      .sendWelcome({ _id: user._id, displayName: user.displayName, email: user.email })
      .catch(err => logger.error('AuthService: welcome email failed to send', err));
  }

  /**
   * POST /api/auth/forgot-password
   * Generate reset token → save hashed version → send reset email.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await User.findOne({ email: email.toLowerCase(), isActive: true });

    // Return silently if user not found — prevents email enumeration
    if (!user) return;

    const resetToken = generateSecureToken();
    // Store only the hash — raw token goes in the email
    const resetHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.passwordResetToken = resetHash;
    user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${config.APP_URL}/reset-password/${resetToken}`;
    container.emailService
      .sendPasswordReset({ _id: user._id, displayName: user.displayName, email: user.email }, resetUrl)
      .catch(err => logger.error('AuthService: password reset email failed to send', err));
  }

  /**
   * PATCH /api/auth/reset-password/:token
   * Verify hashed token → set new password → invalidate all refresh tokens.
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      throw new ApiError(400, 'Password reset link is invalid or has expired');
    }

    user.password = newPassword;         // bcrypt pre-save hook handles hashing
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.refreshToken = undefined;       // invalidate all sessions
    await user.save();
  }
}

export default new AuthService();
