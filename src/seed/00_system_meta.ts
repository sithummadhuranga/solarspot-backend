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

import { ClientSession } from 'mongoose';
import logger from '@utils/logger';

// TODO: Member 4 — import SystemMeta model when implemented
// import { SystemMeta } from '@modules/permissions/system_meta.model';

export async function seedSystemMeta(session: ClientSession): Promise<void> {
  // TODO: Member 4 — implement
  // 1. Drop existing system_meta document (upsert approach)
  // 2. Compute seedManifestHash from all seed data
  // 3. Insert { schemaVersion: '1.0.0', seedManifestHash, seededAt: new Date() }
  logger.warn('seedSystemMeta: not yet implemented');
}
