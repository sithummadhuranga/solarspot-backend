

import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
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
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY } as SignOptions);
}

function generateRefreshToken(userId: string): string {
  return jwt.sign({ _id: userId }, config.JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY } as SignOptions);
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function buildFrontendUrl(pathname: string): string {
  const base = config.FRONTEND_URL.replace(/\/+$/, '');
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${base}${normalizedPath}`;
}

export class AuthService {
  
  async register(input: CreateUserInput): Promise<{ message: string }> {
    const { displayName, email, password } = input;

    const existing = await User.findOne({ email: email.toLowerCase() }).lean();
    if (existing) {
      throw new ApiError(409, 'An account with this email already exists', ['Email already registered']);
    }

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

    const verifyUrl = buildFrontendUrl(`/verify-email/${emailVerifyToken}`);
    container.emailService
      .sendVerifyEmail({ _id: createdUserId, displayName, email }, verifyUrl)
      .catch(err => logger.error('AuthService: verify email failed to send', err));

    return { message: 'Registration successful. Please check your email to verify your account.' };
  }

  
  async login(input: LoginInput): Promise<{ accessToken: string; refreshToken: string; user: object }> {
    const { email, password } = input;

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

    await User.findByIdAndUpdate(user._id, { $set: { refreshToken } });

    return {
      accessToken,
      refreshToken,
      user: user.toJSON(),
    };
  }

  
  async logout(userId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, { $unset: { refreshToken: 1 } });
  }

  
  async refresh(oldRefreshToken: string): Promise<{ accessToken: string; refreshToken: string; user: object }> {
    let decoded: { _id: string };

    try {
      decoded = jwt.verify(oldRefreshToken, config.JWT_SECRET) as { _id: string };
    } catch {
      throw new ApiError(401, 'Invalid or expired refresh token');
    }

    const newRefreshToken = generateRefreshToken(decoded._id);

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
    return { accessToken, refreshToken: newRefreshToken, user: user.toJSON() };
  }

  
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

  
  async forgotPassword(email: string): Promise<void> {
    const user = await User.findOne({ email: email.toLowerCase(), isActive: true });

    if (!user) return;

    const resetToken = generateSecureToken();
    const resetHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.passwordResetToken = resetHash;
    user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const resetUrl = buildFrontendUrl(`/reset-password/${resetToken}`);
    container.emailService
      .sendPasswordReset({ _id: user._id, displayName: user.displayName, email: user.email }, resetUrl)
      .catch(err => logger.error('AuthService: password reset email failed to send', err));
  }

  
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
