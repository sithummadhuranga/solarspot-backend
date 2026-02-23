import mongoose from 'mongoose';
import Joi from 'joi';
import User from '@modules/users/user.model';
import ApiError from '@utils/ApiError';
import logger from '@utils/logger';

async function getCounts(userId: string): Promise<{ stationCount: number; reviewCount: number }> {
  let stationCount = 0;
  let reviewCount = 0;

  try {
    if (mongoose.modelNames().includes('Station')) {
      stationCount = await mongoose.model('Station').countDocuments({ submittedBy: userId });
    }
  } catch {
    // ignore — Station module not registered
  }

  try {
    if (mongoose.modelNames().includes('Review')) {
      reviewCount = await mongoose.model('Review').countDocuments({ user: userId });
    }
  } catch {
    // ignore — Review module not registered
  }

  return { stationCount, reviewCount };
}


const updateMeSchema = Joi.object({
  displayName: Joi.string().min(2).max(50).optional(),
  avatarUrl: Joi.string().uri().allow(null, '').optional(),
  bio: Joi.string().max(300).allow(null, '').optional(),
  preferences: Joi.object({
    defaultRadius: Joi.number().positive().optional(),
    connectorTypes: Joi.array().items(Joi.string()).optional(),
    emailNotifications: Joi.boolean().optional(),
  }).optional(),
}).unknown(false);

const validRoles = ['user', 'moderator', 'admin'] as const;
type ValidRole = typeof validRoles[number];

interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: string;
}

interface AdminFilters {
  role?: string;
  isActive?: boolean;
  isEmailVerified?: boolean;
  search?: string;
}

export async function getMe(userId: string): Promise<Record<string, unknown>> {
  const user = await User.findById(userId).select(
    '_id email displayName avatarUrl role bio preferences isEmailVerified lastLoginAt createdAt'
  );

  if (!user) throw new ApiError(404, 'User not found');

  const { stationCount, reviewCount } = await getCounts(userId);

  return {
    _id: user._id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    bio: user.bio,
    preferences: user.preferences,
    isEmailVerified: user.isEmailVerified,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    stationCount,
    reviewCount,
  };
}

export async function updateMe(
  userId: string,
  updates: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { error, value } = updateMeSchema.validate(updates, { abortEarly: false });
  if (error) {
    const messages = error.details.map((d) => d.message);
    throw new ApiError(422, 'Validation failed', messages);
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: value },
    { new: true, runValidators: true }
  ).select('_id email displayName avatarUrl role bio preferences isEmailVerified lastLoginAt createdAt');

  if (!user) throw new ApiError(404, 'User not found');

  logger.info('User updated own profile', { userId });

  return {
    _id: user._id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    bio: user.bio,
    preferences: user.preferences,
    isEmailVerified: user.isEmailVerified,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export async function getPublicProfile(userId: string): Promise<Record<string, unknown>> {
  const user = await User.findById(userId).select(
    '_id displayName avatarUrl bio createdAt isActive'
  );

  if (!user || !user.isActive) throw new ApiError(404, 'User not found');

  const { stationCount, reviewCount } = await getCounts(userId);

  return {
    _id: user._id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    joinDate: user.createdAt,
    stationCount,
    reviewCount,
  };
}

export async function adminListUsers(
  filters: AdminFilters,
  pagination: PaginationOptions
): Promise<{
  users: unknown[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const page = Math.max(1, pagination.page ?? 1);
  const limit = Math.min(50, Math.max(1, pagination.limit ?? 10));
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};

  if (filters.role) query.role = filters.role;
  if (typeof filters.isActive === 'boolean') query.isActive = filters.isActive;
  if (typeof filters.isEmailVerified === 'boolean') query.isEmailVerified = filters.isEmailVerified;
  if (filters.search) {
    const regex = { $regex: filters.search, $options: 'i' };
    query.$or = [{ email: regex }, { displayName: regex }];
  }

  const sortMap: Record<string, Record<string, number>> = {
    createdAt: { createdAt: -1 },
    displayName: { displayName: 1 },
  };
  const sortKey = pagination.sort && sortMap[pagination.sort] ? pagination.sort : 'createdAt';
  const sort = sortMap[sortKey];

  const [users, total] = await Promise.all([
    User.find(query)
      .select('_id email displayName avatarUrl role isEmailVerified isActive lastLoginAt createdAt')
      .sort(sort as Record<string, 1 | -1>)
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  return {
    users,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function adminChangeRole(
  adminId: string,
  targetUserId: string,
  newRole: string
): Promise<Record<string, unknown>> {
  if (!validRoles.includes(newRole as ValidRole)) {
    throw new ApiError(400, `Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }

  if (adminId === targetUserId) {
    throw new ApiError(400, 'Cannot change your own role');
  }

  const targetUser = await User.findById(targetUserId);
  if (!targetUser) throw new ApiError(404, 'User not found');

  if (targetUser.role === 'admin' && newRole !== 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
    if (adminCount <= 1) {
      throw new ApiError(400, 'Cannot demote the last admin');
    }
  }

  const oldRole = targetUser.role;
  targetUser.role = newRole as 'user' | 'moderator' | 'admin';
  await targetUser.save();

  logger.info('Admin changed user role', { adminId, targetUserId, oldRole, newRole });

  return {
    _id: targetUser._id,
    email: targetUser.email,
    displayName: targetUser.displayName,
    role: targetUser.role,
  };
}

export async function adminSoftDeleteUser(
  adminId: string,
  targetUserId: string
): Promise<{ message: string }> {
  if (adminId === targetUserId) {
    throw new ApiError(400, 'Cannot delete your own account');
  }

  const targetUser = await User.findById(targetUserId).select('+refreshToken');
  if (!targetUser) throw new ApiError(404, 'User not found');

  targetUser.isActive = false;
  targetUser.email = `deleted_${targetUserId}@deleted.solarspot`;
  targetUser.refreshToken = null;
  await targetUser.save();

  logger.info('Admin soft-deleted user', { adminId, targetUserId });

  return { message: 'User account has been deactivated and anonymised' };
}
