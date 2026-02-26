/**
 * Unit tests — AuthService
 * All external deps (DB, Email, JWT) are mocked.
 * Ref: MASTER_PROMPT.md → Testing — Unit tests must mock all external deps
 */

import { Types } from 'mongoose';

// ─── Mock modules before importing AuthService ───────────────────────────────

// config must be mocked first — it is evaluated at import time
jest.mock('@config/env', () => ({
  config: {
    JWT_SECRET:          'test-jwt-secret-that-is-at-least-64-chars-long-for-compliance-xyz',
    JWT_ACCESS_EXPIRES:  '15m',
    JWT_REFRESH_EXPIRES: '7d',
    COOKIE_SECRET:       'test-cookie-secret-min-32-chars!!',
    APP_URL:             'http://localhost:5173',
    APP_NAME:            'SolarSpot',
    NODE_ENV:            'test',
    EMAIL_PREVIEW:       true,
  },
}));

jest.mock('@modules/users/user.model', () => ({
  User: {
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findOneAndUpdate: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('@modules/permissions/role.model', () => ({
  Role: { findOne: jest.fn() },
}));

jest.mock('@/container', () => ({
  container: {
    emailService: {
      sendVerifyEmail:   jest.fn().mockResolvedValue(undefined),
      sendWelcome:       jest.fn().mockResolvedValue(undefined),
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    },
  },
}));

jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  const mockSession = {
    withTransaction: jest.fn().mockImplementation((fn: () => Promise<void>) => fn()),
    endSession: jest.fn().mockResolvedValue(undefined),
  };
  return { ...actual, startSession: jest.fn().mockResolvedValue(mockSession) };
});

// Import service AFTER mocks are in place
import AuthService from '@modules/auth/auth.service';
import { User }    from '@modules/users/user.model';
import { Role }    from '@modules/permissions/role.model';
import ApiError    from '@utils/ApiError';

const mockUser = User as jest.Mocked<typeof User>;
const mockRole = Role as jest.Mocked<typeof Role>;

const FAKE_ROLE_ID  = new Types.ObjectId();
const FAKE_USER_ID  = new Types.ObjectId();

const fakeRole = { _id: FAKE_ROLE_ID, name: 'user', isActive: true };
const fakeUser = {
  _id: FAKE_USER_ID,
  displayName: 'Test User',
  email: 'test@example.com',
  password: 'hashed',
  role: fakeRole,
  isActive: true,
  isEmailVerified: true,
  isBanned: false,
  refreshToken: 'old-token',
  comparePassword: jest.fn(),
  save: jest.fn().mockResolvedValue(undefined),
  toJSON: jest.fn().mockReturnValue({ _id: FAKE_USER_ID, email: 'test@example.com' }),
  set: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── register ───────────────────────────────────────────────────────────────

describe('AuthService.register', () => {
  it('should create user and send verification email', async () => {
    mockUser.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) } as never);   // no duplicate
    mockRole.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(fakeRole) } as never); // default role
    mockUser.create.mockResolvedValue([{ _id: FAKE_USER_ID }] as never);

    const result = await AuthService.register({
      displayName: 'Test User',
      email: 'new@example.com',
      password: 'Password1!',
    });

    expect(result.message).toMatch(/check your email/i);
    expect(mockUser.create).toHaveBeenCalledTimes(1);
  });

  it('should throw 409 if email already registered', async () => {
    mockUser.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(fakeUser) } as never);

    await expect(
      AuthService.register({ displayName: 'X', email: 'test@example.com', password: 'Pass1!' }),
    ).rejects.toBeInstanceOf(ApiError);

    await expect(
      AuthService.register({ displayName: 'X', email: 'test@example.com', password: 'Pass1!' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('should throw 500 if default role is missing (seed not run)', async () => {
    mockUser.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) } as never);
    mockRole.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) } as never); // no role seeded

    await expect(
      AuthService.register({ displayName: 'X', email: 'new@example.com', password: 'Pass1!' }),
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});

// ─── login ───────────────────────────────────────────────────────────────────

describe('AuthService.login', () => {
  const _userWithPassword = {
    ...fakeUser,
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockResolvedValue({ ...fakeUser }),
  };

  beforeEach(() => {
    (mockUser.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue(fakeUser),
    });
    fakeUser.comparePassword.mockResolvedValue(true);
    mockUser.findByIdAndUpdate.mockResolvedValue(fakeUser as never);
  });

  it('should return accessToken and refreshToken on valid credentials', async () => {
    const result = await AuthService.login({ email: 'test@example.com', password: 'correct' });
    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result).toHaveProperty('user');
  });

  it('should throw 401 if user not found', async () => {
    (mockUser.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue(null),
    });
    await expect(
      AuthService.login({ email: 'nobody@example.com', password: 'x' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('should throw 401 if password incorrect', async () => {
    fakeUser.comparePassword.mockResolvedValue(false);
    await expect(
      AuthService.login({ email: 'test@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('should throw 403 if account is banned', async () => {
    (mockUser.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue({ ...fakeUser, isBanned: true }),
    });
    await expect(
      AuthService.login({ email: 'test@example.com', password: 'correct' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ─── logout ──────────────────────────────────────────────────────────────────

describe('AuthService.logout', () => {
  it('should unset refreshToken', async () => {
    mockUser.findByIdAndUpdate.mockResolvedValue(null);
    await expect(AuthService.logout(FAKE_USER_ID.toString())).resolves.toBeUndefined();
    expect(mockUser.findByIdAndUpdate).toHaveBeenCalledWith(
      FAKE_USER_ID.toString(),
      { $unset: { refreshToken: 1 } },
    );
  });
});

// ─── refresh ─────────────────────────────────────────────────────────────────

const TEST_SECRET = 'test-jwt-secret-that-is-at-least-64-chars-long-for-compliance-xyz';

describe('AuthService.refresh', () => {
  it('should return new tokens if old token is valid', async () => {
    const realJwt = jest.requireActual<typeof import('jsonwebtoken')>('jsonwebtoken');
    const oldToken = realJwt.sign(
      { id: FAKE_USER_ID.toString() },
      TEST_SECRET,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { expiresIn: '7d' } as any,
    );

    mockUser.findOneAndUpdate.mockResolvedValue({ ...fakeUser, refreshToken: 'new' } as never);

    const result = await AuthService.refresh(oldToken);
    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
  });

  it('should throw 401 if refresh token not found / already rotated', async () => {
    const realJwt = jest.requireActual<typeof import('jsonwebtoken')>('jsonwebtoken');
    const oldToken = realJwt.sign(
      { id: FAKE_USER_ID.toString() },
      TEST_SECRET,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { expiresIn: '7d' } as any,
    );

    mockUser.findOneAndUpdate.mockResolvedValue(null); // token not matched (already rotated)
    await expect(AuthService.refresh(oldToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('should throw 401 for invalid JWT', async () => {
    await expect(AuthService.refresh('not-a-jwt')).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ─── verifyEmail ─────────────────────────────────────────────────────────────

describe('AuthService.verifyEmail', () => {
  it('should mark user verified and send welcome email', async () => {
    const unverifiedUser = { ...fakeUser, isEmailVerified: false, save: jest.fn().mockResolvedValue(undefined) };
    (mockUser.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(unverifiedUser as never),
    });

    await expect(AuthService.verifyEmail('valid-token')).resolves.toBeUndefined();
    expect(unverifiedUser.save).toHaveBeenCalled();
  });

  it('should throw 400 if token is invalid or expired', async () => {
    (mockUser.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });
    await expect(AuthService.verifyEmail('bad-token')).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ─── forgotPassword ──────────────────────────────────────────────────────────

describe('AuthService.forgotPassword', () => {
  it('should send reset email when user exists', async () => {
    (mockUser.findOne as jest.Mock).mockResolvedValue({ ...fakeUser, save: jest.fn().mockResolvedValue(undefined) } as never);
    await expect(AuthService.forgotPassword('test@example.com')).resolves.toBeUndefined();
  });

  it('should silently succeed when email not found (no enumeration)', async () => {
    mockUser.findOne.mockResolvedValue(null);
    await expect(AuthService.forgotPassword('nobody@example.com')).resolves.toBeUndefined();
  });
});

// ─── resetPassword ────────────────────────────────────────────────────────────

describe('AuthService.resetPassword', () => {
  it('should update password and invalidate refresh token', async () => {
    const savedUser = { ...fakeUser, save: jest.fn().mockResolvedValue(undefined) };
    (mockUser.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(savedUser as never),
    });

    await expect(AuthService.resetPassword('raw-token', 'NewPass1!')).resolves.toBeUndefined();
    expect(savedUser.save).toHaveBeenCalled();
    expect(savedUser.refreshToken).toBeUndefined();
  });

  it('should throw 400 if reset token is expired', async () => {
    (mockUser.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });
    await expect(AuthService.resetPassword('expired', 'NewPass1!')).rejects.toMatchObject({ statusCode: 400 });
  });
});

