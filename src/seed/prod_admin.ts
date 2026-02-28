/**
 * Production admin seeder — seeds a single, real admin account.
 *
 * Credentials are read from env vars so they are never hardcoded in source:
 *   ADMIN_EMAIL     (required)
 *   ADMIN_PASSWORD  (required, min 8 chars)
 *
 * Operation is a pure upsert (idempotent) — safe to re-run without
 * creating duplicates or overwriting manual changes to other fields.
 *
 * Depends on: 03_roles (admin role must already exist)
 * ⚠️  Do NOT include in demo or dev-only seed chains.
 */

import bcrypt from 'bcryptjs';
import { ClientSession } from 'mongoose';
import { User } from '@modules/users/user.model';
import { Role } from '@modules/permissions/role.model';
import logger from '@utils/logger';

const SALT_ROUNDS = 12;

export async function seedProductionAdmin(session: ClientSession): Promise<void> {
  const email    = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD?.trim();

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
      // Only set displayName and createdAt if this is a new document.
      $setOnInsert: {
        displayName: 'SolarSpot Admin',
      },
    },
    { upsert: true, returnDocument: 'after', ...(session ? { session } : {}) },
  );

  logger.info(`✅  production admin upserted: ${email}`);
}
