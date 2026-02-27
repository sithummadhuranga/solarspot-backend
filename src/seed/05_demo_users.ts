/**
 * Seeder 05 — demo_users
 *
 * Owner: Member 4
 * Seeds 5 demo user accounts for development and evaluation.
 *
 * Ref: PROJECT_OVERVIEW.md → Demo Credentials
 *
 * Depends on: 03_roles
 * ⚠️  DEV ONLY — never run seed:demo in production (demo:reset clears the DB first)
 */

import bcrypt from 'bcryptjs';
import { ClientSession } from 'mongoose';
import { User } from '@modules/users/user.model';
import { Role } from '@modules/permissions/role.model';
import logger from '@utils/logger';

// ─── Demo credentials ────────────────────────────────────────────────────────
// Ref: PROJECT_OVERVIEW.md → Demo Credentials
export const DEMO_USERS = [
  { email: 'admin@solarspot.app',       password: 'Admin@2026!',  role: 'admin',         displayName: 'Admin User',     isEmailVerified: true  },
  { email: 'mod@solarspot.app',         password: 'Mod@2026!',    role: 'moderator',     displayName: 'Mod User',       isEmailVerified: true  },
  { email: 'owner@solarspot.app',       password: 'Owner@2026!',  role: 'station_owner', displayName: 'Station Owner',  isEmailVerified: true  },
  { email: 'user@solarspot.app',        password: 'User@2026!',   role: 'user',          displayName: 'Regular User',   isEmailVerified: true  },
  { email: 'unverified@solarspot.app',  password: 'User@2026!',   role: 'user',          displayName: 'Unverified User',isEmailVerified: false },
];

export async function seedDemoUsers(session: ClientSession): Promise<void> {
  const roles = await Role.find().lean();
  const roleMap = new Map(roles.map(r => [r.name as string, r._id]));

  const SALT_ROUNDS = 12;

  for (const demo of DEMO_USERS) {
    const roleId = roleMap.get(demo.role);
    if (!roleId) {
      logger.warn(`⚠️  seedDemoUsers: role "${demo.role}" not found — skipping ${demo.email}`);
      continue;
    }
    const hashedPassword = await bcrypt.hash(demo.password, SALT_ROUNDS);
    await User.findOneAndUpdate(
      { email: demo.email },
      {
        $set: {
          displayName:     demo.displayName,
          email:           demo.email,
          password:        hashedPassword,
          role:            roleId,
          isEmailVerified: demo.isEmailVerified,
          isActive:        true,
        },
      },
      { upsert: true, returnDocument: 'after', session },
    );
  }
  logger.info(`✅  demo users seeded (${DEMO_USERS.length})`);
}
