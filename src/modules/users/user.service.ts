

import mongoose from 'mongoose';
import { User } from './user.model';
import { Role } from '@modules/permissions/role.model';
import { AuditLog } from '@modules/permissions/audit_log.model';
import ApiError from '@utils/ApiError';
import type {
  IUser,
  UpdateProfileInput,
  AdminUpdateUserInput,
  PaginationResult,
} from '@/types';

class UserService {
  
  async getMe(userId: string): Promise<IUser> {
    const user = await User.findById(userId).populate('role').lean();
    if (!user) throw ApiError.notFound('User not found');
    return user as IUser;
  }

  
  async updateMe(userId: string, input: UpdateProfileInput): Promise<IUser> {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: input },
      { returnDocument: 'after', runValidators: true },
    ).populate('role');

    if (!user) throw ApiError.notFound('User not found');
    return user as IUser;
  }

  
  async deleteMe(userId: string): Promise<void> {
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        const user = await User.findOne({ _id: userId, isActive: true }).session(session);
        if (!user) throw ApiError.notFound('User not found');

        const before = { isActive: user.isActive };
        user.isActive = false;
        user.deletedAt = new Date();
        user.refreshToken = undefined;
        await user.save({ session });

        await AuditLog.create(
          [{ actor: userId, action: 'users.delete-own', resource: 'User', resourceId: userId, before, after: { isActive: false } }],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
  }

  
  async listUsers(query: Record<string, unknown>): Promise<PaginationResult<IUser>> {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(query.limit ?? 20)));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (query.role) filter['role'] = await Role.findOne({ name: query.role }).select('_id').lean().then(r => r?._id);
    if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
    if (query.search) {
      filter['$or'] = [
        { displayName: { $regex: query.search, $options: 'i' } },
        { email: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      User.find(filter).populate('role').lean().skip(skip).limit(limit).sort({ createdAt: -1 }),
      User.countDocuments(filter),
    ]);

    return { data: data as IUser[], total, page, limit, pages: Math.ceil(total / limit) };
  }

  
  async getUserById(id: string): Promise<IUser> {
    const user = await User.findOne({ _id: id, isActive: true }).populate('role').lean();
    if (!user) throw ApiError.notFound('User not found');
    return user as IUser;
  }

  
  async adminUpdateUser(
    targetId: string,
    input: AdminUpdateUserInput,
    actorId: string,
  ): Promise<IUser> {
    const session = await mongoose.startSession();
    let updated: IUser | null = null;

    try {
      await session.withTransaction(async () => {
        const user = await User.findById(targetId).session(session);
        if (!user) throw ApiError.notFound('User not found');

        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};

        if (input.role !== undefined) {
          const role = await Role.findOne({ name: input.role, isActive: true }).lean();
          if (!role) throw ApiError.badRequest(`Role '${input.role}' not found`);
          before.role = user.role;
          after.role = role._id;
          user.role = role._id as unknown as mongoose.Types.ObjectId;
        }

        if (input.isActive !== undefined) {
          before.isActive = user.isActive;
          after.isActive = input.isActive;
          user.isActive = input.isActive;
        }

        if (input.isBanned !== undefined) {
          before.isBanned = user.isBanned;
          after.isBanned = input.isBanned;
          user.isBanned = input.isBanned;
        }

        await user.save({ session });

        await AuditLog.create(
          [{ actor: actorId, action: 'users.manage', resource: 'User', resourceId: targetId, before, after }],
          { session },
        );
      });
      updated = await User.findById(targetId).populate('role').lean() as IUser;
    } finally {
      await session.endSession();
    }

    return updated!;
  }
}

export default new UserService();
