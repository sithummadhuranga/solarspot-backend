/**
 * Unit tests — PermissionService
 * Ref: MASTER_PROMPT.md → Testing → PermissionEngine isolated, mock DB calls
 */

import { Types } from 'mongoose';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@modules/permissions/permission.model', () => ({
  Permission: { find: jest.fn(), findById: jest.fn() },
}));
jest.mock('@modules/permissions/role.model', () => ({
  Role: { find: jest.fn(), findById: jest.fn() },
}));
jest.mock('@modules/permissions/role_permission.model', () => ({
  RolePermission: { find: jest.fn(), findOne: jest.fn(), deleteOne: jest.fn(), create: jest.fn() },
}));
jest.mock('@modules/permissions/user_permission_override.model', () => ({
  UserPermissionOverride: { find: jest.fn(), findOneAndUpdate: jest.fn(), deleteOne: jest.fn() },
}));
jest.mock('@modules/permissions/audit_log.model', () => ({
  AuditLog: { find: jest.fn(), create: jest.fn().mockResolvedValue([{}]) },
}));
jest.mock('@modules/users/user.model', () => ({
  User: { findById: jest.fn() },
}));
jest.mock('@/container', () => ({
  container: {
    permissionEngine: { evaluate: jest.fn(), flush: jest.fn() },
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

import PermissionService             from '@modules/permissions/permission.service';
import { Permission }                from '@modules/permissions/permission.model';
import { Role }                      from '@modules/permissions/role.model';
import { RolePermission }            from '@modules/permissions/role_permission.model';
import { UserPermissionOverride }    from '@modules/permissions/user_permission_override.model';
import { AuditLog }                  from '@modules/permissions/audit_log.model';
import { container }                 from '@/container';
import ApiError                      from '@utils/ApiError';

const mockPermission        = Permission        as jest.Mocked<typeof Permission>;
const mockRole              = Role              as jest.Mocked<typeof Role>;
const mockRolePerm          = RolePermission    as jest.Mocked<typeof RolePermission>;
const mockOverride          = UserPermissionOverride as jest.Mocked<typeof UserPermissionOverride>;
const mockAuditLog          = AuditLog          as jest.Mocked<typeof AuditLog>;
const mockContainer         = container         as jest.Mocked<typeof container>;

const ROLE_ID   = new Types.ObjectId();
const PERM_ID   = new Types.ObjectId();
const USER_ID   = new Types.ObjectId();

beforeEach(() => jest.clearAllMocks());

// ─── listPermissions ──────────────────────────────────────────────────────────

describe('PermissionService.listPermissions', () => {
  it('should return permissions sorted by action', async () => {
    (mockPermission.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ action: 'stations.view' }]),
    });
    const result = await PermissionService.listPermissions();
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('stations.view');
  });
});

// ─── listRoles ────────────────────────────────────────────────────────────────

describe('PermissionService.listRoles', () => {
  it('should return roles sorted by roleLevel', async () => {
    (mockRole.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ name: 'user', roleLevel: 1 }]),
    });
    const result = await PermissionService.listRoles();
    expect(result[0].name).toBe('user');
  });
});

// ─── assignPermissionToRole ───────────────────────────────────────────────────

describe('PermissionService.assignPermissionToRole', () => {
  it('should create a RolePermission document', async () => {
    (mockRole.findById as jest.Mock).mockResolvedValue({ _id: ROLE_ID } as never);
    (mockPermission.findById as jest.Mock).mockResolvedValue({ _id: PERM_ID } as never);

    const created = { _id: new Types.ObjectId(), role: ROLE_ID, permission: PERM_ID, policies: [] };
    // findOne inside transaction returns null (no existing) → triggers create path
    (mockRolePerm.findOne as jest.Mock).mockReturnValue({ session: jest.fn().mockResolvedValue(null) });
    (mockRolePerm.create as jest.Mock).mockResolvedValue([created]);
    (mockRolePerm.findOne as jest.Mock)
      .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(null) })     // inside transaction
      .mockReturnValueOnce({ populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(created) }); // after save

    const result = await PermissionService.assignPermissionToRole(
      ROLE_ID.toString(),
      PERM_ID.toString(),
    );
    expect(result).toBeDefined();
  });

  it('should throw 404 if role not found', async () => {
    (mockRole.findById as jest.Mock).mockResolvedValue(null);
    (mockPermission.findById as jest.Mock).mockResolvedValue({ _id: PERM_ID });
    await expect(
      PermissionService.assignPermissionToRole('bad-role', PERM_ID.toString()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('should throw 404 if permission not found', async () => {
    (mockRole.findById as jest.Mock).mockResolvedValue({ _id: ROLE_ID });
    (mockPermission.findById as jest.Mock).mockResolvedValue(null);
    await expect(
      PermissionService.assignPermissionToRole(ROLE_ID.toString(), 'bad-perm'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ─── removePermissionFromRole ─────────────────────────────────────────────────

describe('PermissionService.removePermissionFromRole', () => {
  it('should delete the RolePermission document', async () => {
    const rpDoc = { _id: new Types.ObjectId(), role: ROLE_ID, permission: PERM_ID };
    // First findOne call (outside transaction — check existence)
    (mockRolePerm.findOne as jest.Mock).mockResolvedValue(rpDoc as never);
    // deleteOne inside transaction needs .session() chain
    (mockRolePerm.deleteOne as jest.Mock).mockReturnValue({ session: jest.fn().mockResolvedValue({ deletedCount: 1 }) });

    await expect(
      PermissionService.removePermissionFromRole(ROLE_ID.toString(), PERM_ID.toString()),
    ).resolves.toBeUndefined();
  });
});

// ─── overrideUserPermission ───────────────────────────────────────────────────

describe('PermissionService.overrideUserPermission', () => {
  it('should upsert override and write audit log', async () => {
    const { User: MockUserModel } = require('@modules/users/user.model');
    (MockUserModel.findById as jest.Mock).mockResolvedValue({ _id: USER_ID } as never);
    (mockPermission.findById as jest.Mock).mockResolvedValue({ _id: PERM_ID } as never);

    const overrideDoc = { _id: new Types.ObjectId(), user: USER_ID, permission: PERM_ID, effect: 'grant' };
    (mockOverride.findOneAndUpdate as jest.Mock).mockResolvedValue(overrideDoc as never);
    (mockAuditLog.create as jest.Mock).mockResolvedValue([{}]);

    const result = await PermissionService.overrideUserPermission(
      USER_ID.toString(),
      PERM_ID.toString(),
      'grant',
      'actor-id',
    );
    expect(result.effect).toBe('grant');
    expect(mockAuditLog.create).toHaveBeenCalled();
  });
});

// ─── checkAccess ──────────────────────────────────────────────────────────────

describe('PermissionService.checkAccess', () => {
  it('should delegate to PermissionEngine and return result', async () => {
    const fakeRole = { name: 'user', roleLevel: 1 };
    const { User: MockUserModel } = require('@modules/users/user.model');
    (MockUserModel.findById as jest.Mock).mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        _id: USER_ID, role: fakeRole, isEmailVerified: true, isActive: true, isBanned: false,
      } as never),
    });
    (mockContainer.permissionEngine.evaluate as jest.Mock).mockResolvedValue({ allowed: true, reason: 'role' });

    const result = await PermissionService.checkAccess(USER_ID.toString(), 'stations.view');
    expect(result.allowed).toBe(true);
    expect(mockContainer.permissionEngine.evaluate).toHaveBeenCalled();
  });
});

// ─── listAuditLogs ────────────────────────────────────────────────────────────

describe('PermissionService.listAuditLogs', () => {
  it('should return paginated audit logs', async () => {
    const fakeLogs = [{ action: 'stations.create', result: 'granted' }];
    (mockAuditLog.find as jest.Mock).mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort:     jest.fn().mockReturnThis(),
      skip:     jest.fn().mockReturnThis(),
      limit:    jest.fn().mockReturnThis(),
      lean:     jest.fn().mockResolvedValue(fakeLogs),
    });
    Object.defineProperty(AuditLog, 'countDocuments', {
      value: jest.fn().mockResolvedValue(1),
      writable: true,
      configurable: true,
    });

    const result = await PermissionService.listAuditLogs({});
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});
