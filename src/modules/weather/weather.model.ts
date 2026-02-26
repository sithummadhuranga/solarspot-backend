/**
 * WeatherCache — persists OpenWeatherMap API responses per station in MongoDB.
 *
 * Each station gets one document. The TTL index on `expiresAt` means MongoDB
 * automatically removes stale documents after 30 minutes — no cron needed.
 *
 * We store both current conditions and the 5-day forecast in the same document
 * so a single DB read satisfies both the /weather and /forecast endpoints on
 * a cache hit.
 *
 * Owner: Member 3 · Ref: PROJECT_OVERVIEW.md → Third-Party APIs
 */

import { Schema, model, Types, Document } from 'mongoose';
import type { WeatherData, ForecastSlot } from '@/types';

// Strip _raw before persisting — clients never see raw provider payloads
export type CachedWeatherData = Omit<WeatherData, '_raw'>;

export interface IWeatherCache extends Document {
  stationId:   Types.ObjectId;
  coordinates: [number, number];     // [lng, lat] — stored so we can build heatmap without joining Station
  current?:    CachedWeatherData;
  forecast?:   ForecastSlot[];
  fetchedAt:   Date;
  expiresAt:   Date;                 // TTL index fires when this passes
}

const weatherCacheSchema = new Schema<IWeatherCache>(
  {
    stationId:   { type: Schema.Types.ObjectId, ref: 'Station', required: true, unique: true },
    coordinates: { type: [Number], required: true },
    current:     { type: Schema.Types.Mixed },
    forecast:    { type: [Schema.Types.Mixed] },
    fetchedAt:   { type: Date, required: true },
    expiresAt:   { type: Date, required: true },
  },
  { timestamps: false },
);

// TTL index — the database removes the document once expiresAt has passed.
// expireAfterSeconds:0 means "expire at the exact time in expiresAt".
weatherCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const WeatherCache = model<IWeatherCache>('WeatherCache', weatherCacheSchema);
