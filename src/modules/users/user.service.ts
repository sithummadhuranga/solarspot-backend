/**
 * User service — business logic layer for user management.
 *
 * TODO: Member 4 — implement each method. DO NOT touch Controller or Model directly
 *                   from outside this service except via its public interface.
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Users (6 endpoints)
 *      MASTER_PROMPT.md → Controller → Service → Model (strict layering)
 *      MASTER_PROMPT.md → ACID — use mongoose sessions for multi-doc writes
 */

import type {
  IUser,
  UpdateProfileInput,
  AdminUpdateUserInput,
  PaginationResult,
} from '@/types';
import logger from '@utils/logger';

class UserService {
  /**
   * GET /users/me — return the authenticated user's profile.
   * TODO: Member 4 — populate role, exclude __v
   */
  async getMe(_userId: string): Promise<IUser> {
    logger.warn('UserService.getMe: not yet implemented');
    throw new Error('Not implemented');
  }

  /**
   * PATCH /users/me — update own profile (name, avatar, preferences).
   * TODO: Member 4 — validate updated fields, handle Cloudinary upload if avatar provided
   */
  async updateMe(_userId: string, _input: UpdateProfileInput): Promise<IUser> {
    logger.warn('UserService.updateMe: not yet implemented');
    throw new Error('Not implemented');
  }

  /**
   * DELETE /users/me — soft-delete own account (set isActive:false, anonymise PII).
   * TODO: Member 4 — ACID: soft-delete + invalidate all refresh tokens atomically
   */
  async deleteMe(_userId: string): Promise<void> {
    logger.warn('UserService.deleteMe: not yet implemented');
    throw new Error('Not implemented');
  }

  /**
   * GET /admin/users — paginated list of all users (admin/super-admin).
   * TODO: Member 4 — support filters: role, isActive, search by email/name
   */
  async listUsers(_query: Record<string, unknown>): Promise<PaginationResult<IUser>> {
    logger.warn('UserService.listUsers: not yet implemented');
    throw new Error('Not implemented');
  }

  /**
   * GET /admin/users/:id — get any user by id (admin/super-admin).
   * TODO: Member 4
   */
  async getUserById(_id: string): Promise<IUser> {
    logger.warn('UserService.getUserById: not yet implemented');
    throw new Error('Not implemented');
  }

  /**
   * PATCH /admin/users/:id — admin update user (role, isActive, etc.).
   * TODO: Member 4 — guard: SUPER_ADMIN cannot be demoted except by another SUPER_ADMIN
   */
  async adminUpdateUser(_id: string, _input: AdminUpdateUserInput): Promise<IUser> {
    logger.warn('UserService.adminUpdateUser: not yet implemented');
    throw new Error('Not implemented');
  }
}

export default new UserService();
