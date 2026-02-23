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

import { ClientSession } from 'mongoose';
import logger from '@utils/logger';

// TODO: Member 4 — import models when implemented
// import { User } from '@modules/users/user.model';
// import { Role } from '@modules/permissions/role.model';

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
  // TODO: Member 4 — implement
  // 1. For each demo user, resolve the role ObjectId from ROLES_SEED
  // 2. Hash passwords with bcrypt (rounds: 12)
  // 3. Upsert by email — idempotent
  logger.warn('seedDemoUsers: not yet implemented');
}
