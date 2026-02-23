import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '@modules/users/user.model';
import ApiError from '@utils/ApiError';
import * as emailService from '@utils/email.service';
import { config } from '@config/env';
import logger from '@utils/logger';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

function generateTokens(userId: string, role: string): Tokens {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accessToken = jwt.sign(
    { sub: userId, role },
    config.JWT_SECRET,
    { expiresIn: config.JWT_ACCESS_EXPIRES as any }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refreshToken = jwt.sign(
    { sub: userId },
    config.JWT_REFRESH_SECRET,
    { expiresIn: config.JWT_REFRESH_EXPIRES as any }
  );

  return { accessToken, refreshToken };
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Create a new user account and send an email verification link.
 */
export async function register(
  email: string,
  password: string,
  displayName: string
): Promise<{ _id: string; email: string; displayName: string; role: string }> {
  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    throw new ApiError(409, 'Email already registered');
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = sha256(rawToken);

  const user = await User.create({
    email,
    password,   // pre-save hook will hash it
    displayName,
    emailVerifyToken: hashedToken,
    emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // +24h
  });

  try {
    await emailService.sendVerificationEmail(user.email, user.displayName, rawToken);
  } catch (err) {
    logger.error('Failed to send verification email', { userId: user._id, err });
    // Non-fatal — user can request resend later
  }

  logger.info('User registered', { userId: user._id, email: user.email });

  return {
    _id: (user._id as { toString(): string }).toString(),
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

/**
 * Verify an email address using the token sent during registration.
 * Returns JWT access + refresh tokens on success.
 */
export async function verifyEmail(token: string): Promise<Tokens & { user: Record<string, unknown> }> {
  const hashedToken = sha256(token);

  const user = await User.findOne({
    emailVerifyToken: hashedToken,
    emailVerifyExpires: { $gt: new Date() },
  }).select('+emailVerifyToken +refreshToken');

  if (!user) {
    throw new ApiError(400, 'Invalid or expired verification token');
  }

  user.isEmailVerified = true;
  user.emailVerifyToken = null;
  user.emailVerifyExpires = null;

  const tokens = generateTokens(user._id.toString(), user.role);
  user.refreshToken = sha256(tokens.refreshToken);
  await user.save();

  logger.info('Email verified', { userId: user._id });

  return {
    ...tokens,
    user: {
      _id: user._id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
  };
}

/**
 * Authenticate a user by email + password.
 * Returns access token, refresh token, and safe user object.
 */
export async function login(
  email: string,
  password: string
): Promise<Tokens & { user: Record<string, unknown> }> {
  const user = await User.findByEmail(email);

  // Use same message for missing user and wrong password — prevents enumeration
  const credentialsError = new ApiError(401, 'Invalid credentials');

  if (!user) throw credentialsError;

  const passwordOk = await user.comparePassword(password);
  if (!passwordOk) {
    logger.warn('Failed login attempt: wrong password', { email });
    throw credentialsError;
  }

  if (!user.isEmailVerified) {
    throw new ApiError(403, 'Please verify your email before logging in');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account has been deactivated');
  }

  const tokens = generateTokens(user._id.toString(), user.role);

  user.refreshToken = sha256(tokens.refreshToken);
  user.lastLoginAt = new Date();
  await user.save();

  logger.info('User logged in', { userId: user._id });

  return {
    ...tokens,
    user: {
      _id: user._id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    },
  };
}

/**
 * Invalidate the stored refresh token (log out a user from all devices).
 */
export async function logout(userId: string): Promise<void> {
  await User.findByIdAndUpdate(userId, { refreshToken: null });
  logger.info('User logged out', { userId });
}

/**
 * Verify an incoming refresh token, rotate it, and issue new access + refresh tokens.
 */
export async function refreshAccessToken(incomingRefreshToken: string): Promise<Tokens> {
  let payload: jwt.JwtPayload;

  try {
    payload = jwt.verify(incomingRefreshToken, config.JWT_REFRESH_SECRET) as jwt.JwtPayload;
  } catch {
    throw new ApiError(401, 'Invalid refresh token');
  }

  const hashedIncoming = sha256(incomingRefreshToken);

  const user = await User.findOne({
    _id: payload.sub,
    refreshToken: hashedIncoming,
  }).select('+refreshToken');

  if (!user) {
    throw new ApiError(401, 'Invalid refresh token');
  }

  const tokens = generateTokens(user._id.toString(), user.role);
  user.refreshToken = sha256(tokens.refreshToken);
  await user.save();

  logger.info('Refresh token rotated', { userId: user._id });

  return tokens;
}

/**
 * Send a password reset email if the email belongs to an existing account.
 * Always returns a success message to prevent account enumeration.
 */
export async function forgotPassword(email: string): Promise<{ message: string }> {
  const user = await User.findOne({ email: email.toLowerCase().trim() });

  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = sha256(rawToken);
    user.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // +10min
    await user.save();

    try {
      await emailService.sendPasswordResetEmail(user.email, user.displayName, rawToken);
    } catch (err) {
      logger.error('Failed to send password reset email', { userId: user._id, err });
    }

    logger.info('Password reset requested', { userId: user._id });
  } else {
    logger.warn('Password reset requested for unknown email', { email });
  }

  return { message: 'If an account exists, a reset link has been sent' };
}

/**
 * Reset a user's password using the token sent via email.
 * Invalidates all existing sessions on success.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const hashedToken = sha256(token);

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetToken +refreshToken');

  if (!user) {
    throw new ApiError(400, 'Invalid or expired reset token');
  }

  user.password = newPassword; // pre-save hook will hash it
  user.passwordResetToken = null;
  user.passwordResetExpires = null;
  user.refreshToken = null; // invalidate all active sessions
  await user.save();

  logger.info('Password reset successfully', { userId: user._id });
}
