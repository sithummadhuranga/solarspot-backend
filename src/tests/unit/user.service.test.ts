/**
 * Unit tests — UserService
 * TODO: Member 4 — implement tests.
 */

describe('UserService', () => {
  describe('getMe', () => {
    it.todo('should return user profile');
    it.todo('should throw 404 if user not found');
  });

  describe('updateMe', () => {
    it.todo('should update allowed fields');
    it.todo('should not allow email/role change via this route');
  });

  describe('deleteMe', () => {
    it.todo('should soft-delete user and invalidate refresh tokens');
  });

  describe('listUsers', () => {
    it.todo('should return paginated users list');
    it.todo('should support role and isActive filters');
  });

  describe('adminUpdateUser', () => {
    it.todo('should update role');
    it.todo('should throw 403 if trying to demote SUPER_ADMIN without SUPER_ADMIN role');
  });
});
