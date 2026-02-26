/**
 * Seeder 02 — policies
 *
 * Owner: Member 4
 * Seeds all 13 built-in policy documents.
 *
 * Ref: PROJECT_OVERVIEW.md → Policies — 13 Built-in
 *
 * Data is additive (upsert by slug) — safe to re-run.
 */

import { ClientSession } from 'mongoose';
import { PolicyCondition } from '@/types';
import { Policy } from '@modules/permissions/policy.model';
import logger from '@utils/logger';

interface PolicySeed {
  name: string;
  slug: string;
  condition: PolicyCondition;
  effect: 'allow' | 'deny';
  config?: Record<string, unknown>;
  isSystem: boolean;
}

// ─── Seed data — 13 policies ─────────────────────────────────────────────────
// Ref: PROJECT_OVERVIEW.md → Policies — 13 Built-in
export const POLICIES_SEED: PolicySeed[] = [
  { name: 'Email Verified Only',         slug: 'email_verified_only',     condition: 'email_verified',   effect: 'allow', isSystem: true },
  { name: 'Active Account Only',         slug: 'active_account_only',     condition: 'account_active',   effect: 'allow', isSystem: true },
  { name: 'Not Banned',                  slug: 'not_banned',              condition: 'checkBanned',      effect: 'allow', isSystem: true },
  { name: 'Owner Match Station',         slug: 'owner_match_station',     condition: 'owner_match',      effect: 'allow', config: { ownerField: 'submittedBy' }, isSystem: true },
  { name: 'Owner Match Review',          slug: 'owner_match_review',      condition: 'owner_match',      effect: 'allow', config: { ownerField: 'author' },      isSystem: true },
  { name: 'Owner Match User',            slug: 'owner_match_user',        condition: 'owner_match',      effect: 'allow', config: { ownerField: '_id' },         isSystem: true },
  { name: 'Owner Match Notification',    slug: 'owner_match_notification',condition: 'owner_match',      effect: 'allow', config: { ownerField: 'recipient' },   isSystem: true },
  { name: 'One Review Per Station',      slug: 'one_review_per_station',  condition: 'unique_review',    effect: 'deny',  isSystem: true },
  { name: 'Not Own Station',             slug: 'not_own_station',         condition: 'ownership_check',  effect: 'deny',  config: { mustNotMatch: true },        isSystem: true },
  { name: 'No Self Vote',                slug: 'no_self_vote',            condition: 'no_self_vote',     effect: 'deny',  isSystem: true },
  { name: 'Review Time Window',          slug: 'review_time_window',      condition: 'time_window',      effect: 'allow', config: { hours: 48 },                isSystem: true },
  { name: 'Admin Protection',            slug: 'admin_protection',        condition: 'role_minimum',     effect: 'deny',  config: { minLevel: 4 },              isSystem: true },
  { name: 'Station Approved',            slug: 'station_approved',        condition: 'field_equals',     effect: 'allow', config: { field: 'status', value: 'approved' }, isSystem: true },
];

export async function seedPolicies(session: ClientSession): Promise<void> {
  const ops = POLICIES_SEED.map(p => ({
    updateOne: {
      filter: { slug: p.slug },
      update: { $set: p },
      upsert: true,
    },
  }));
  await Policy.bulkWrite(ops, { session } as Parameters<typeof Policy.bulkWrite>[1]);
  logger.info(`✅  policies seeded (${POLICIES_SEED.length})`);
}
