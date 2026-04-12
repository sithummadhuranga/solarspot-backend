

import { Schema, model, Types, Document } from 'mongoose';
import type { WeatherData, ForecastSlot } from '@/types';

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

weatherCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const WeatherCache = model<IWeatherCache>('WeatherCache', weatherCacheSchema);
