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

/** Full payload embedded in every access token — keeps protect + checkPermission middleware
 *  stateless (no DB round-trip on every request). Fields mirror what auth.middleware reads. */
interface AccessTokenPayload {
  _id: string;
  email: string;
  role: string;           // MongoDB ObjectId string of the Role document
  roleLevel: number;      // pre-baked level so RBAC never falls back to the stale ROLES map
  isEmailVerified: boolean;
  isActive: boolean;
  isBanned: boolean;
}

function generateAccessToken(payload: AccessTokenPayload): string {
  // jsonwebtoken@9 types incorrectly require `number` for `expiresIn` when using string
  // duration values ('15m', '7d'). The library accepts strings at runtime — this is a
  // known upstream type defect (DefinitelyTyped#55030). The values are validated
  // duration strings from env.ts, so the cast is safe.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY } as any);
}

function generateRefreshToken(userId: string): string {
  // Refresh token is a simple credential — only needs to identify the user.
  // Uses `_id` key to stay consistent with the access token and middleware expectations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign({ _id: userId }, config.JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY } as any);
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

    let createdUserId!: import('mongoose').Types.ObjectId;

    const session = await mongoose.startSession();
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
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? '';
      if (msg.includes('replica set') || msg.includes('Transaction numbers')) {
        // Standalone MongoDB — create without session
        const [newUser] = await User.create([
          {
            displayName,
            email: email.toLowerCase(),
            password,
            role: defaultRole._id,
            emailVerifyToken,
            emailVerifyExpires,
          },
        ]);
        createdUserId = newUser._id;
      } else {
        throw err;
      }
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

    // Access token embeds role data so RBAC middleware is stateless
    const roleDoc = user.role as { _id: import('mongoose').Types.ObjectId; roleLevel: number };
    const accessToken = generateAccessToken({
      _id:             user._id.toString(),
      email:           user.email,
      role:            roleDoc._id.toString(),
      roleLevel:       roleDoc.roleLevel ?? 1,
      isEmailVerified: user.isEmailVerified,
      isActive:        user.isActive,
      isBanned:        user.isBanned ?? false,
    });
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
    let decoded: { _id: string };

    try {
      decoded = jwt.verify(oldRefreshToken, config.JWT_SECRET) as { _id: string };
    } catch {
      throw new ApiError(401, 'Invalid or expired refresh token');
    }

    const newRefreshToken = generateRefreshToken(decoded._id);

    // Rotate: match on OLD token value — ensures only one rotation wins if two requests race.
    // Populate role so we can bake the fresh roleLevel into the new access token.
    const user = await User.findOneAndUpdate(
      { _id: decoded._id, refreshToken: oldRefreshToken },
      { $set: { refreshToken: newRefreshToken } },
      { new: true },
    ).populate<{ role: { _id: import('mongoose').Types.ObjectId; roleLevel: number } }>('role');

    if (!user) {
      throw new ApiError(401, 'Refresh token has already been rotated or is invalid');
    }

    const accessToken = generateAccessToken({
      _id:             user._id.toString(),
      email:           user.email,
      role:            user.role._id.toString(),
      roleLevel:       user.role.roleLevel ?? 1,
      isEmailVerified: user.isEmailVerified,
      isActive:        user.isActive,
      isBanned:        user.isBanned ?? false,
    });
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
