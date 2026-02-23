/**
 * Seeder 07 — demo_reviews
 *
 * Owner: Member 2 — implement demo review shapes.
 * Owner: Member 4 — runs this as part of the seed pipeline.
 *
 * Seeds sample reviews against demo stations.
 * Depends on: 05_demo_users, 06_demo_stations
 *
 * ⚠️  DEV ONLY — never run seed:demo in production.
 */

import { ClientSession } from 'mongoose';
import logger from '@utils/logger';

// TODO: Member 2 — define demo review data here once review.model.ts is implemented
export const DEMO_REVIEWS: unknown[] = [
  // TODO: Member 2 — add demo review objects
  // {
  //   rating: 5,
  //   content: 'Excellent solar station, charged my EV in under 2 hours.',
  //   moderationStatus: 'approved',
  //   ...
  // }
];

export async function seedDemoReviews(_session: ClientSession): Promise<void> {
  // TODO: Member 4 — implement upsert logic once DEMO_REVIEWS is filled
  logger.warn('seedDemoReviews: not yet implemented');
}
