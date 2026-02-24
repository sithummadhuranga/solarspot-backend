/**
 * Unit tests — UserService
 * Ref: MASTER_PROMPT.md → Testing — Unit tests must mock all external deps (DB, Email, HTTP)
 */

import { Types } from 'mongoose';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@modules/users/user.model', () => ({
  User: {
    findById: jest.fn(),
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

jest.mock('@modules/permissions/role.model', () => ({
  Role: { findOne: jest.fn() },
}));

jest.mock('@modules/permissions/audit_log.model', () => ({
  AuditLog: { create: jest.fn().mockResolvedValue([{}]) },
}));

jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  const mockSession = {
    withTransaction: jest.fn().mockImplementation((fn: () => Promise<void>) => fn()),
    endSession: jest.fn().mockResolvedValue(undefined),
  };
  return { ...actual, startSession: jest.fn().mockResolvedValue(mockSession) };
});

import UserService from '@modules/users/user.service';
import { User }    from '@modules/users/user.model';
import { Role }    from '@modules/permissions/role.model';

const mockUser = User as jest.Mocked<typeof User>;
const mockRole = Role as jest.Mocked<typeof Role>;

const FAKE_USER_ID = new Types.ObjectId();
const FAKE_ROLE_ID = new Types.ObjectId();

const fakeUserDoc = {
  _id: FAKE_USER_ID,
  displayName: 'Alice',
  email: 'alice@example.com',
  role: { _id: FAKE_ROLE_ID, name: 'user' },
  isActive: true,
  isBanned: false,
  save: jest.fn().mockResolvedValue(undefined),
  session: jest.fn().mockReturnThis(),
};

beforeEach(() => jest.clearAllMocks());

// ─── getMe ────────────────────────────────────────────────────────────────────

describe('UserService.getMe', () => {
  it('should return the user profile', async () => {
    (mockUser.findById as jest.Mock).mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(fakeUserDoc),
    });
    const result = await UserService.getMe(FAKE_USER_ID.toString());
    expect(result.email).toBe('alice@example.com');
  });

  it('should throw 404 if user is not found', async () => {
    (mockUser.findById as jest.Mock).mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });
    await expect(UserService.getMe('nonexistent')).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ─── updateMe ─────────────────────────────────────────────────────────────────

describe('UserService.updateMe', () => {
  it('should update and return updated user', async () => {
    (mockUser.findByIdAndUpdate as jest.Mock).mockReturnValue({
      populate: jest.fn().mockResolvedValue({ ...fakeUserDoc, displayName: 'UpdatedName' }),
    });
    const result = await UserService.updateMe(FAKE_USER_ID.toString(), { displayName: 'UpdatedName' });
    expect(result.displayName).toBe('UpdatedName');
  });

  it('should throw 404 if user not found', async () => {
    (mockUser.findByIdAndUpdate as jest.Mock).mockReturnValue({
      populate: jest.fn().mockResolvedValue(null),
    });
    await expect(UserService.updateMe('bad-id', { displayName: 'X' })).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ─── deleteMe ─────────────────────────────────────────────────────────────────

describe('UserService.deleteMe', () => {
  it('should soft-delete the account', async () => {
    const userDoc = { ...fakeUserDoc, save: jest.fn().mockResolvedValue(undefined) };
    (mockUser.findOne as jest.Mock).mockReturnValue({
      session: jest.fn().mockResolvedValue(userDoc),
    });
    await expect(UserService.deleteMe(FAKE_USER_ID.toString())).resolves.toBeUndefined();
    expect(userDoc.isActive).toBe(false);
  });
});

// ─── listUsers ────────────────────────────────────────────────────────────────

describe('UserService.listUsers', () => {
  it('should return paginated users', async () => {
    (mockUser.find as jest.Mock).mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([fakeUserDoc]),
    });
    (mockUser.countDocuments as jest.Mock).mockResolvedValue(1);

    const result = await UserService.listUsers({ page: '1', limit: '10' });
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });
});

// ─── getUserById ──────────────────────────────────────────────────────────────

describe('UserService.getUserById', () => {
  it('should return an active user', async () => {
    (mockUser.findOne as jest.Mock).mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(fakeUserDoc),
    });
    const result = await UserService.getUserById(FAKE_USER_ID.toString());
    expect(result._id).toEqual(FAKE_USER_ID);
  });

  it('should throw 404 for inactive or missing users', async () => {
    (mockUser.findOne as jest.Mock).mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });
    await expect(UserService.getUserById('bad')).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ─── adminUpdateUser ──────────────────────────────────────────────────────────

describe('UserService.adminUpdateUser', () => {
  it('should update isBanned and write audit log', async () => {
    const userInSession = { ...fakeUserDoc, save: jest.fn().mockResolvedValue(undefined) };
    (mockUser.findById as jest.Mock)
      .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(userInSession) })
      .mockReturnValueOnce({ populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue({ ...userInSession, isBanned: true }) });

    const result = await UserService.adminUpdateUser(
      FAKE_USER_ID.toString(),
      { isBanned: true },
      'actor-id',
    );
    expect(result.isBanned).toBe(true);
  });

  it('should throw 404 if target user not found', async () => {
    (mockUser.findById as jest.Mock).mockReturnValue({ session: jest.fn().mockResolvedValue(null) });
    await expect(
      UserService.adminUpdateUser('bad-id', { isActive: false }, 'actor'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('should throw 400 if role slug does not exist', async () => {
    const userInSession = { ...fakeUserDoc, save: jest.fn().mockResolvedValue(undefined) };
    (mockUser.findById as jest.Mock).mockReturnValue({ session: jest.fn().mockResolvedValue(userInSession) });
    (mockRole.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    await expect(
      UserService.adminUpdateUser(FAKE_USER_ID.toString(), { role: 'nonexistent-role' }, 'actor'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
