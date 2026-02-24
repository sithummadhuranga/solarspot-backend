import bcrypt from 'bcryptjs';
import User from '@modules/users/user.model';
import Role from '@modules/permissions/models/role.model';
import logger from '@utils/logger';

/**
 * Demo users for testing
 */
const DEMO_USERS = [
  {
    email: 'admin@solarspot.app',
    password: 'Admin@2026!',
    displayName: 'Admin User',
    role: 'admin',
    isEmailVerified: true,
  },
  {
    email: 'mod@solarspot.app',
    password: 'Mod@2026!',
    displayName: 'Moderator User',
    role: 'moderator',
    isEmailVerified: true,
  },
  {
    email: 'owner@solarspot.app',
    password: 'Owner@2026!',
    displayName: 'Station Owner',
    role: 'station_owner',
    isEmailVerified: true,
  },
  {
    email: 'user@solarspot.app',
    password: 'User@2026!',
    displayName: 'Regular User',
    role: 'user',
    isEmailVerified: true,
  },
  {
    email: 'unverified@solarspot.app',
    password: 'User@2026!',
    displayName: 'Unverified User',
    role: 'user',
    isEmailVerified: false,
  },
];

/**
 * Seeder 05 — Demo Users
 * Creates demo user accounts for testing.
 */
export async function seed05DemoUsers(): Promise<void> {
  logger.info('[Seeder 05] Running: Demo Users');

  const existingCount = await User.countDocuments();

  if (existingCount > 0) {
    logger.info(`[Seeder 05] ${existingCount} users already exist, skipping`);
    return;
  }

  // Hash passwords
  const users = await Promise.all(
    DEMO_USERS.map(async (user) => ({
      ...user,
      password: await bcrypt.hash(user.password, 12),
      avatarUrl: null,
      preferences: {},
      bio: null,
      isActive: true,
      lastLoginAt: null,
    }))
  );

  await User.insertMany(users);
  logger.info(`[Seeder 05] Inserted ${users.length} demo users`);

  // Log credentials for reference
  logger.info('[Seeder 05] Demo credentials:');
  DEMO_USERS.forEach((u) => {
    logger.info(`  ${u.email} / ${u.password} (${u.role})`);
  });
}
