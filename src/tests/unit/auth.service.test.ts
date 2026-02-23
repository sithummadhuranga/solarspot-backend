import crypto from 'crypto';
import * as authService from '@modules/users/auth.service';
import ApiError from '@utils/ApiError';


jest.mock('@modules/users/user.model');
jest.mock('@utils/email.service');
jest.mock('jsonwebtoken');

import User from '@modules/users/user.model';
import * as emailService from '@utils/email.service';
import jwt from 'jsonwebtoken';

const MockUser = User as jest.Mocked<typeof User>;
const mockJwt = jwt as jest.Mocked<typeof jwt>;
const mockEmail = emailService as jest.Mocked<typeof emailService>;


function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function makeMockUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'user123',
    email: 'test@example.com',
    displayName: 'Test User',
    role: 'user',
    password: 'hashed_password',
    isEmailVerified: true,
    isActive: true,
    avatarUrl: null,
    emailVerifyToken: null,
    emailVerifyExpires: null,
    refreshToken: null,
    passwordResetToken: null,
    passwordResetExpires: null,
    comparePassword: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}


describe('authService.register()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a user and sends a verification email', async () => {
    MockUser.findOne = jest.fn().mockResolvedValue(null);

    const savedUser = makeMockUser();
    (MockUser.create as jest.Mock) = jest.fn().mockResolvedValue(savedUser);

    mockEmail.sendVerificationEmail = jest.fn().mockResolvedValue(undefined);

    const result = await authService.register('test@example.com', 'password123', 'Test User');

    expect(MockUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'test@example.com',
        displayName: 'Test User',
      })
    );
    expect(mockEmail.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });

  it('throws 409 when email is already registered', async () => {
    MockUser.findOne = jest.fn().mockResolvedValue(makeMockUser());

    await expect(
      authService.register('test@example.com', 'password123', 'Test User')
    ).rejects.toMatchObject({ statusCode: 409, message: 'Email already registered' });

    expect(ApiError).toBeDefined();
  });
});

describe('authService.verifyEmail()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks the user as verified and returns tokens', async () => {
    const rawToken = 'rawtoken123';
    const hashedToken = sha256(rawToken);

    const mockUser = makeMockUser({
      isEmailVerified: false,
      emailVerifyToken: hashedToken,
      emailVerifyExpires: new Date(Date.now() + 60_000),
    });

    MockUser.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(mockUser),
    });

    mockJwt.sign = jest.fn()
      .mockReturnValueOnce('mock-access-token')
      .mockReturnValueOnce('mock-refresh-token');

    const result = await authService.verifyEmail(rawToken);

    expect(mockUser.isEmailVerified).toBe(true);
    expect(mockUser.emailVerifyToken).toBeNull();
    expect(mockUser.save).toHaveBeenCalled();
    expect(result).toMatchObject({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    });
  });

  it('throws 400 when token is invalid or expired', async () => {
    MockUser.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    await expect(authService.verifyEmail('badtoken')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid or expired verification token',
    });
  });
});

describe('authService.login()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns tokens and user on valid credentials', async () => {
    const mockUser = makeMockUser({
      comparePassword: jest.fn().mockResolvedValue(true),
    });

    MockUser.findByEmail = jest.fn().mockResolvedValue(mockUser);

    mockJwt.sign = jest.fn()
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');

    const result = await authService.login('test@example.com', 'correctpass');

    expect(result.accessToken).toBe('access-token');
    expect(result.user).toMatchObject({ email: 'test@example.com' });
    expect(mockUser.save).toHaveBeenCalled();
  });

  it('throws 401 with same message for wrong password', async () => {
    const mockUser = makeMockUser({
      comparePassword: jest.fn().mockResolvedValue(false),
    });

    MockUser.findByEmail = jest.fn().mockResolvedValue(mockUser);

    await expect(authService.login('test@example.com', 'wrongpass')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid credentials',
    });
  });

  it('throws 401 with same message when user is not found', async () => {
    MockUser.findByEmail = jest.fn().mockResolvedValue(null);

    await expect(authService.login('nobody@example.com', 'pass')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid credentials',
    });
  });

  it('throws 403 when email is not verified', async () => {
    const mockUser = makeMockUser({
      isEmailVerified: false,
      comparePassword: jest.fn().mockResolvedValue(true),
    });

    MockUser.findByEmail = jest.fn().mockResolvedValue(mockUser);

    await expect(authService.login('test@example.com', 'pass')).rejects.toMatchObject({
      statusCode: 403,
      message: 'Please verify your email before logging in',
    });
  });
});

describe('authService.refreshAccessToken()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rotates tokens and returns new access + refresh tokens', async () => {
    const incoming = 'old-refresh-token';

    mockJwt.verify = jest.fn().mockReturnValue({ sub: 'user123' });

    const mockUser = makeMockUser({ refreshToken: sha256(incoming) });
    MockUser.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(mockUser),
    });

    mockJwt.sign = jest.fn()
      .mockReturnValueOnce('new-access-token')
      .mockReturnValueOnce('new-refresh-token');

    const result = await authService.refreshAccessToken(incoming);

    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toBe('new-refresh-token');
    expect(mockUser.save).toHaveBeenCalled();
  });
});

describe('authService.forgotPassword()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('always returns success message regardless of whether email exists', async () => {
    // Unknown email
    MockUser.findOne = jest.fn().mockResolvedValue(null);

    const result = await authService.forgotPassword('unknown@example.com');
    expect(result.message).toBe('If an account exists, a reset link has been sent');
  });

  it('sends reset email when account is found, still returns same message', async () => {
    const mockUser = makeMockUser();
    MockUser.findOne = jest.fn().mockResolvedValue(mockUser);
    mockEmail.sendPasswordResetEmail = jest.fn().mockResolvedValue(undefined);

    const result = await authService.forgotPassword('test@example.com');

    expect(mockEmail.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(result.message).toBe('If an account exists, a reset link has been sent');
  });
});

describe('authService.resetPassword()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates password and nullifies all refresh tokens', async () => {
    const rawToken = 'reset-token-raw';

    const mockUser = makeMockUser({
      passwordResetToken: sha256(rawToken),
      passwordResetExpires: new Date(Date.now() + 60_000),
      refreshToken: 'old-hashed-refresh',
    });

    MockUser.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(mockUser),
    });

    await authService.resetPassword(rawToken, 'newSecurePassword1!');

    expect(mockUser.password).toBe('newSecurePassword1!');
    expect(mockUser.passwordResetToken).toBeNull();
    expect(mockUser.passwordResetExpires).toBeNull();
    expect(mockUser.refreshToken).toBeNull();
    expect(mockUser.save).toHaveBeenCalled();
  });

  it('throws 400 on invalid or expired reset token', async () => {
    MockUser.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    await expect(authService.resetPassword('invalid', 'newpass')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid or expired reset token',
    });
  });
});
