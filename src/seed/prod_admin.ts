

import bcrypt from 'bcryptjs';
import { ClientSession } from 'mongoose';
import { config } from '@config/env';
import { User } from '@modules/users/user.model';
import { Role } from '@modules/permissions/role.model';
import logger from '@utils/logger';

const SALT_ROUNDS = 12;

export async function seedProductionAdmin(session: ClientSession): Promise<void> {
  const email = config.ADMIN_EMAIL.trim().toLowerCase();
  const password = config.ADMIN_PASSWORD.trim();

  if (!email || !password) {
    throw new Error(
      'seedProductionAdmin: ADMIN_EMAIL and ADMIN_PASSWORD env vars are required. ' +
      'Set them before running seed:production.',
    );
  }

  if (password.length < 8) {
    throw new Error('seedProductionAdmin: ADMIN_PASSWORD must be at least 8 characters.');
  }

  const adminRole = await Role.findOne({ name: 'admin', isActive: true }, null, { session }).lean();
  if (!adminRole) {
    throw new Error(
      'seedProductionAdmin: admin role not found. Run seed:core first.',
    );
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  await User.findOneAndUpdate(
    { email },
    {
      $set: {
        email,
        password:        hashedPassword,
        role:            adminRole._id,
        isEmailVerified: true,
        isActive:        true,
        isBanned:        false,
      },
      $setOnInsert: {
        displayName: 'SolarSpot Admin',
      },
    },
    { upsert: true, returnDocument: 'after', ...(session ? { session } : {}) },
  );

  logger.info(`✅  production admin upserted: ${email}`);
}
