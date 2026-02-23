/**
 * Unit tests — AuthService
 * TODO: Member 4 — implement tests for each AuthService method.
 * Ref: MASTER_PROMPT.md → Testing — Unit tests must mock all external deps (DB, Email, HTTP)
 */

describe('AuthService', () => {
  describe('register', () => {
    it.todo('should create user and send verification email');
    it.todo('should throw 409 if email already registered');
  });

  describe('login', () => {
    it.todo('should return access token and set refresh cookie on valid credentials');
    it.todo('should throw 401 if password incorrect');
    it.todo('should throw 401 if email not verified');
  });

  describe('logout', () => {
    it.todo('should invalidate refresh token');
  });

  describe('refresh', () => {
    it.todo('should rotate refresh token and return new access token');
    it.todo('should throw 401 if refresh token not found (reuse detected)');
  });

  describe('verifyEmail', () => {
    it.todo('should mark user as verified and delete token');
    it.todo('should throw 400 if token expired');
  });

  describe('forgotPassword', () => {
    it.todo('should send reset email if user exists');
    it.todo('should not reveal whether email exists (200 always)');
  });

  describe('resetPassword', () => {
    it.todo('should update password and invalidate all refresh tokens');
    it.todo('should throw 400 if reset token expired');
  });
});
