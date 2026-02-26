/**
 * Seeder 00 — system_meta
 *
 * Owner: Member 4
 * Creates the single system_meta document that records:
 *   - schemaVersion
 *   - seedManifestHash (SHA-256 of all seed data — used by seed:verify)
 *   - seededAt timestamp
 *
 * Ref: PROJECT_OVERVIEW.md → Database → system_meta collection
 *      PROJECT_OVERVIEW.md → Seeder Commands → seed:verify
 */

import crypto from 'crypto';
import { ClientSession } from 'mongoose';
import { SystemMeta } from '@modules/permissions/system_meta.model';
import { PERMISSIONS_SEED } from './01_permissions';
import { POLICIES_SEED }    from './02_policies';
import { ROLES_SEED }       from './03_roles';
import logger from '@utils/logger';

function computeManifestHash(): string {
  const manifest = JSON.stringify({ PERMISSIONS_SEED, POLICIES_SEED, ROLES_SEED });
  return crypto.createHash('sha256').update(manifest).digest('hex');
}

export async function seedSystemMeta(session: ClientSession): Promise<void> {
  const seedManifestHash = computeManifestHash();
  await SystemMeta.findOneAndUpdate(
    {},
    { $set: { schemaVersion: '1.0.0', seedManifestHash, seededAt: new Date() } },
    { upsert: true, new: true, session },
  );
  logger.info('✅  system_meta seeded');
}
