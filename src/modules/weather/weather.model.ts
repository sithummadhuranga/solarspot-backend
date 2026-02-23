/**
 * Weather/Solar cache model — stores OpenWeatherMap + UV API responses per station.
 *
 * Owner: Member 3 (Solar Intelligence & Weather).
 *
 * TODO: Member 3 — implement fields and TTL index.
 *
 * Ref: PROJECT_OVERVIEW.md → Data Models → WeatherCache
 *      MASTER_PROMPT.md → Third-party API Caching (Redis or Mongo TTL)
 *      MASTER_PROMPT.md → Quota Service — track OWM + UV API call counts
 */

import { Schema, model, Document } from 'mongoose';
import type { WeatherData } from '@/types';

/**
 * WeatherCache document shape.
 * TODO: Member 3 — expand with full WeatherData fields.
 */
export interface IWeatherCache extends Document {
  stationId:   unknown;   // Schema.Types.ObjectId → ref: 'Station'
  coordinates: [number, number]; // [lng, lat]
  current?:    WeatherData;
  forecast?:   unknown[];        // ForecastSlot[]
  solarIndex?: unknown;           // SolarIndex
  fetchedAt:   Date;
  expiresAt:   Date;
}

const weatherCacheSchema = new Schema<IWeatherCache>(
  {
    // stationId:   { type: Schema.Types.ObjectId, ref: 'Station', required: true, unique: true },
    // coordinates: { type: [Number], required: true },  // [lng, lat]
    // current:     { type: Schema.Types.Mixed },        // WeatherData object
    // forecast:    [{ type: Schema.Types.Mixed }],      // ForecastSlot[]
    // solarIndex:  { type: Schema.Types.Mixed },        // SolarIndex object
    // fetchedAt:   { type: Date, required: true },
    // expiresAt:   { type: Date, required: true },
  },
  { timestamps: false },
);

// ── Indexes ──────────────────────────────────────────────────────────────────
// TODO: Member 3 — TTL index so documents auto-expire (e.g. 30 min = 1800 s)
// weatherCacheSchema.index({ stationId: 1 }, { unique: true });
// weatherCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const WeatherCache = model<IWeatherCache>('WeatherCache', weatherCacheSchema);
