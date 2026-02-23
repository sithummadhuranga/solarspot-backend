/**
 * Seeder 06 — demo_stations
 *
 * Owner: Member 1 — implement demo station shapes.
 * Owner: Member 4 — runs this as part of the seed pipeline.
 *
 * Seeds sample solar charging stations across Sri Lanka for development.
 * Depends on: 03_roles, 05_demo_users (stations need a submittedBy user)
 *
 * ⚠️  DEV ONLY — never run seed:demo in production.
 */

import { ClientSession } from 'mongoose';
import logger from '@utils/logger';

// TODO: Member 1 — define demo station data here once station.model.ts is implemented
// Suggested: 5–10 stations across Colombo, Kandy, Galle with realistic coordinates
export const DEMO_STATIONS: unknown[] = [
  // TODO: Member 1 — add demo station objects
  // {
  //   name: 'Colombo Solar Hub',
  //   stationType: 'ChargingStation',
  //   address: { city: 'Colombo', country: 'Sri Lanka' },
  //   location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  //   status: 'approved',
  //   ...
  // }
];

export async function seedDemoStations(session: ClientSession): Promise<void> {
  // TODO: Member 4 — implement upsert logic once DEMO_STATIONS is filled
  logger.warn('seedDemoStations: not yet implemented');
}
