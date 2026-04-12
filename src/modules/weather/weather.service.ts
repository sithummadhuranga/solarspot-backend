

import axios from 'axios';
import { Types } from 'mongoose';
import { Station } from '@modules/stations/station.model';
import { WeatherCache } from './weather.model';
import { container } from '@/container';
import { config } from '@config/env';
import { cacheGet, cacheSet } from '@utils/cache';
import logger from '@utils/logger';
import ApiError from '@utils/ApiError';
import type {
  WeatherData,
  ForecastSlot,
  BestTimeSlot,
  HeatmapPoint,
  BulkRefreshInput,
  WeatherExportQuery,
  SolarIndex,
  IStation,
} from '@/types';


const WEATHER_CACHE_TTL_SECONDS = 1800;

const OWM_BASE = 'https://api.openweathermap.org/data/2.5';

const SRI_LANKA_OFFSET_HOURS = 5.5;

const MAX_UV_CLEAR_SKY = 9;

const BEST_SLOTS_PER_DAY = 2;


interface OWMCurrentResponse {
  main:    { temp: number; humidity: number };
  clouds:  { all: number };
  weather: Array<{ description: string; icon: string }>;
  wind:    { speed: number };
  uvi?:    number;   // present on some stations, absent on many free-tier responses
}

interface OWMForecastItem {
  dt:      number;
  main:    { temp: number; humidity: number };
  clouds:  { all: number };
  pop:     number;   // probability of precipitation 0–1
  weather: Array<{ description: string; icon: string }>;
}

interface OWMForecastResponse {
  list: OWMForecastItem[];
}



function estimateUvIndex(utcTimestamp: Date, cloudCoverPercent: number): number {
  const utcHour = utcTimestamp.getUTCHours() + utcTimestamp.getUTCMinutes() / 60;
  const localHour = (utcHour + SRI_LANKA_OFFSET_HOURS) % 24;

  const hoursFromNoon = Math.abs(localHour - 12.5);

  if (hoursFromNoon > 6.25) return 0;

  const elevationFactor = Math.cos((hoursFromNoon / 6.25) * (Math.PI / 2));
  const cloudReduction  = 1 - (cloudCoverPercent / 100) * 0.85;

  return Math.max(0, parseFloat((MAX_UV_CLEAR_SKY * elevationFactor * cloudReduction).toFixed(1)));
}


function deriveSolarIndex(uvIndex: number, cloudCover: number): SolarIndex {
  if (uvIndex >= 6 && cloudCover <= 20) return 'excellent';
  if (uvIndex >= 4 && cloudCover <= 40) return 'good';
  if (uvIndex >= 2 && cloudCover <= 60) return 'moderate';
  if (uvIndex > 0  || cloudCover < 80)  return 'poor';
  return 'unavailable';
}


function estimateSolarIrradiance(uvIndex: number, cloudCover: number): number {
  const clearSkyFraction = 1 - (cloudCover / 100) * 0.75;
  return Math.round(1_000 * clearSkyFraction * Math.min(uvIndex / MAX_UV_CLEAR_SKY, 1));
}


function scoreForecastSlot(slot: ForecastSlot): number {
  const uvBonus      = Math.min(slot.uvIndex * 2, 10);
  const cloudPenalty = (slot.cloudCover / 100) * 10;
  return Math.max(0, uvBonus - cloudPenalty);
}


const cacheKey = {
  current:  (id: string) => `weather:current:${id}`,
  forecast: (id: string) => `weather:forecast:${id}`,
  heatmap:  ()           => 'weather:heatmap',
};


class WeatherService {


  
  private async resolveStation(stationId: string): Promise<IStation> {
    const station = await Station.findById(stationId).lean<IStation>();
    if (!station || !station.isActive) {
      throw ApiError.notFound('Station not found');
    }
    if (!station.location?.coordinates?.length) {
      throw ApiError.badRequest('Station does not have location coordinates');
    }

    return station;
  }

  
  private async fetchCurrentFromOWM(
    lat: number,
    lng: number,
  ): Promise<OWMCurrentResponse> {
    const canCall = await container.quotaService.check('openweathermap');
    if (!canCall) {
      throw ApiError.internal('OpenWeatherMap daily quota reached — try again tomorrow');
    }

    const response = await axios.get<OWMCurrentResponse>(`${OWM_BASE}/weather`, {
      params: {
        lat,
        lon: lng,
        appid: config.OPENWEATHER_API_KEY,
        units: 'metric',
      },
      timeout: 8_000,
    });

    await container.quotaService.increment('openweathermap');
    return response.data;
  }

  
  private async fetchForecastFromOWM(
    lat: number,
    lng: number,
  ): Promise<OWMForecastResponse> {
    const canCall = await container.quotaService.check('openweathermap');
    if (!canCall) {
      throw ApiError.internal('OpenWeatherMap daily quota reached — try again tomorrow');
    }

    const response = await axios.get<OWMForecastResponse>(`${OWM_BASE}/forecast`, {
      params: {
        lat,
        lon: lng,
        appid: config.OPENWEATHER_API_KEY,
        units: 'metric',
        cnt:   40,    // 5 days × 8 three-hour slots
      },
      timeout: 8_000,
    });

    await container.quotaService.increment('openweathermap');
    return response.data;
  }

  
  private buildWeatherData(
    stationId: string,
    raw: OWMCurrentResponse,
  ): WeatherData {
    const now         = new Date();
    const cloudCover  = raw.clouds.all;
    const uvIndex     = raw.uvi ?? estimateUvIndex(now, cloudCover);

    return {
      stationId,
      fetchedAt:        now,
      temperature:      parseFloat(raw.main.temp.toFixed(1)),
      humidity:         raw.main.humidity,
      cloudCover,
      uvIndex:          parseFloat(uvIndex.toFixed(1)),
      solarIrradiance:  estimateSolarIrradiance(uvIndex, cloudCover),
      solarIndex:       deriveSolarIndex(uvIndex, cloudCover),
      description:      raw.weather[0]?.description ?? '',
      icon:             raw.weather[0]?.icon ?? '',
      windSpeed:        parseFloat(raw.wind.speed.toFixed(1)),
      _raw:             raw as unknown as Record<string, unknown>,
    };
  }

  
  private buildForecastSlot(item: OWMForecastItem): ForecastSlot {
    const timestamp  = new Date(item.dt * 1_000);
    const cloudCover = item.clouds.all;
    const uvIndex    = estimateUvIndex(timestamp, cloudCover);

    return {
      timestamp,
      temperature:   parseFloat(item.main.temp.toFixed(1)),
      cloudCover,
      uvIndex:       parseFloat(uvIndex.toFixed(1)),
      solarIndex:    deriveSolarIndex(uvIndex, cloudCover),
      precipitation: parseFloat((item.pop * 10).toFixed(1)),  // pop 0–1 → mm proxy
    };
  }

  
  private async persistToCache(
    stationId: string,
    coordinates: [number, number],
    current: WeatherData,
    forecast: ForecastSlot[],
  ): Promise<void> {
    const now      = new Date();
    const expiresAt = new Date(now.getTime() + WEATHER_CACHE_TTL_SECONDS * 1_000);

    const { _raw, ...currentWithoutRaw } = current;

    await WeatherCache.findOneAndUpdate(
      { stationId: new Types.ObjectId(stationId) },
      { $set: { coordinates, current: currentWithoutRaw, forecast, fetchedAt: now, expiresAt } },
      { upsert: true },
    );

    cacheSet(cacheKey.current(stationId),  current,  WEATHER_CACHE_TTL_SECONDS);
    cacheSet(cacheKey.forecast(stationId), forecast, WEATHER_CACHE_TTL_SECONDS);
  }


  
  async getCurrentWeather(stationId: string): Promise<WeatherData> {
    if (!Types.ObjectId.isValid(stationId)) {
      throw ApiError.notFound('Station not found');
    }

    const memHit = cacheGet<WeatherData>(cacheKey.current(stationId));
    if (memHit) return memHit;

    const dbHit = await WeatherCache.findOne({
      stationId: new Types.ObjectId(stationId),
    }).lean();

    if (dbHit?.current) {
      const remainingTtl = Math.floor((dbHit.expiresAt.getTime() - Date.now()) / 1_000);
      if (remainingTtl > 0) {
        cacheSet(cacheKey.current(stationId), dbHit.current, remainingTtl);
        return dbHit.current as WeatherData;
      }
    }

    const station = await this.resolveStation(stationId);
    const [lng, lat] = station.location!.coordinates;

    const raw      = await this.fetchCurrentFromOWM(lat, lng);
    const current  = this.buildWeatherData(stationId, raw);

    let forecast: ForecastSlot[] = [];
    try {
      const rawForecast = await this.fetchForecastFromOWM(lat, lng);
      forecast = rawForecast.list.map((item) => this.buildForecastSlot(item));
    } catch (err) {
      logger.warn('WeatherService: forecast fetch failed during current-weather refresh', { err });
    }

    await this.persistToCache(stationId, [lng, lat], current, forecast);

    return current;
  }

  
  async getForecast(stationId: string): Promise<ForecastSlot[]> {
    if (!Types.ObjectId.isValid(stationId)) {
      throw ApiError.notFound('Station not found');
    }

    const memHit = cacheGet<ForecastSlot[]>(cacheKey.forecast(stationId));
    if (memHit) return memHit;

    const dbHit = await WeatherCache.findOne({
      stationId: new Types.ObjectId(stationId),
    }).lean();

    if (dbHit?.forecast?.length) {
      const remainingTtl = Math.floor((dbHit.expiresAt.getTime() - Date.now()) / 1_000);
      if (remainingTtl > 0) {
        cacheSet(cacheKey.forecast(stationId), dbHit.forecast, remainingTtl);
        return dbHit.forecast as ForecastSlot[];
      }
    }

    const station = await this.resolveStation(stationId);
    const [lng, lat] = station.location!.coordinates;

    const rawForecast = await this.fetchForecastFromOWM(lat, lng);
    const forecast    = rawForecast.list.map((item) => this.buildForecastSlot(item));

    let current: WeatherData | undefined;
    try {
      const rawCurrent = await this.fetchCurrentFromOWM(lat, lng);
      current = this.buildWeatherData(stationId, rawCurrent);
    } catch (err) {
      logger.warn('WeatherService: current-weather refresh failed during forecast fetch', { err });
    }

    if (current) {
      await this.persistToCache(stationId, [lng, lat], current, forecast);
    } else {
      cacheSet(cacheKey.forecast(stationId), forecast, WEATHER_CACHE_TTL_SECONDS);
    }

    return forecast;
  }

  
  async getBestTimes(stationId: string): Promise<BestTimeSlot[]> {
    const forecast = await this.getForecast(stationId);

    const daylightSlots = forecast.filter((slot) => {
      const localHour = (slot.timestamp.getUTCHours() + SRI_LANKA_OFFSET_HOURS) % 24;
      return localHour >= 6 && localHour <= 18;
    });

    const byDate = new Map<string, Array<{ slot: ForecastSlot; score: number; localHour: number }>>();

    for (const slot of daylightSlots) {
      const utcMs        = slot.timestamp.getTime();
      const localMs      = utcMs + SRI_LANKA_OFFSET_HOURS * 3_600_000;
      const localDate    = new Date(localMs).toISOString().split('T')[0];
      const localHour    = new Date(localMs).getUTCHours();

      const entry = byDate.get(localDate) ?? [];
      entry.push({ slot, score: scoreForecastSlot(slot), localHour });
      byDate.set(localDate, entry);
    }

    const results: BestTimeSlot[] = [];

    for (const [date, entries] of byDate) {
      const sorted    = [...entries].sort((a, b) => b.score - a.score);
      const topSlots  = sorted.slice(0, BEST_SLOTS_PER_DAY);

      for (const { slot, score, localHour } of topSlots) {
        const solarLabel = slot.solarIndex;
        const reason     = buildBestTimeReason(slot, score);

        results.push({
          date,
          startHour:  localHour,
          endHour:    Math.min(localHour + 3, 18),   // 3-hour slot, capped at sunset
          solarIndex: solarLabel,
          reason,
        });
      }
    }

    return results.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.startHour - b.startHour;
    });
  }

  
  async getSolarHeatmap(): Promise<HeatmapPoint[]> {
    const memHit = cacheGet<HeatmapPoint[]>(cacheKey.heatmap());
    if (memHit) return memHit;

    const cached = await WeatherCache.find({}).lean();

    const points: HeatmapPoint[] = cached
      .filter((doc) => doc.current != null)
      .map((doc) => {
        const current = doc.current as WeatherData;
        return {
          stationId:  doc.stationId.toString(),
          lat:        doc.coordinates[1],
          lng:        doc.coordinates[0],
          solarIndex: current.solarIndex,
          uvIndex:    current.uvIndex,
          cloudCover: current.cloudCover,
        };
      });

    cacheSet(cacheKey.heatmap(), points, 300);

    return points;
  }

  
  async bulkRefresh(input: BulkRefreshInput): Promise<{ refreshed: number; failed: number }> {
    let stationIds: string[];

    if (input.stationIds?.length) {
      stationIds = input.stationIds;
    } else {
      const stations = await Station.find({ status: 'approved', isActive: true })
        .select('_id')
        .lean<Array<{ _id: Types.ObjectId }>>();

      stationIds = stations.map((s) => s._id.toString());
    }

    let refreshed = 0;
    let failed    = 0;

    for (const id of stationIds) {
      try {
        if (!input.force) {
          const inMemory = cacheGet<WeatherData>(cacheKey.current(id));
          if (inMemory) {
            logger.debug(`bulkRefresh: station ${id} cache hit, skipping`);
            refreshed++;
            continue;
          }
        }

        await delay(150);

        await this.getCurrentWeather(id);
        refreshed++;
        logger.info(`bulkRefresh: refreshed station ${id}`);
      } catch (err) {
        failed++;
        logger.error(`bulkRefresh: failed for station ${id}`, { err });
      }
    }

    cacheSet(cacheKey.heatmap(), null, 1);

    return { refreshed, failed };
  }

  
  async exportWeatherData(query: WeatherExportQuery): Promise<{
    data:        string;
    contentType: string;
    filename:    string;
  }> {
    const filter: Record<string, unknown> = {};

    if (query.stationId) {
      filter.stationId = new Types.ObjectId(query.stationId);
    }
    if (query.from || query.to) {
      const dateFilter: Record<string, Date> = {};
      if (query.from) dateFilter.$gte = new Date(query.from);
      if (query.to)   dateFilter.$lte  = new Date(query.to);
      filter.fetchedAt = dateFilter;
    }

    const records = await WeatherCache.find(filter).lean() as unknown as Array<Record<string, unknown>>;

    if (query.format === 'csv') {
      const csv = buildCsv(records);
      return {
        data:        csv,
        contentType: 'text/csv',
        filename:    `solarspot-weather-${todayString()}.csv`,
      };
    }

    return {
      data:        JSON.stringify(records, null, 2),
      contentType: 'application/json',
      filename:    `solarspot-weather-${todayString()}.json`,
    };
  }
}



function buildBestTimeReason(slot: ForecastSlot, score: number): string {
  if (score >= 15) return `Excellent solar conditions — UV ${slot.uvIndex}, ${slot.cloudCover}% cloud cover`;
  if (score >= 10) return `Good solar conditions — UV ${slot.uvIndex}, ${slot.cloudCover}% cloud cover`;
  if (score >= 5)  return `Moderate solar conditions — UV ${slot.uvIndex}, ${slot.cloudCover}% cloud cover`;
  return `Low solar conditions — UV ${slot.uvIndex}, ${slot.cloudCover}% cloud cover`;
}


function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


function todayString(): string {
  return new Date().toISOString().split('T')[0];
}


function buildCsv(records: Array<Record<string, unknown>>): string {
  const headers = [
    'stationId', 'lat', 'lng', 'temperature', 'humidity',
    'cloudCover', 'uvIndex', 'solarIndex', 'solarIrradiance',
    'windSpeed', 'description', 'fetchedAt',
  ];

  const rows = records.map((doc) => {
    const current = (doc.current ?? {}) as Record<string, unknown>;
    const coords  = (doc.coordinates as number[]) ?? [0, 0];

    return [
      String(doc.stationId),
      String(coords[1]),       // lat
      String(coords[0]),       // lng
      String(current.temperature  ?? ''),
      String(current.humidity     ?? ''),
      String(current.cloudCover   ?? ''),
      String(current.uvIndex      ?? ''),
      String(current.solarIndex   ?? ''),
      String(current.solarIrradiance ?? ''),
      String(current.windSpeed    ?? ''),
      csvEscape(String(current.description ?? '')),
      String(doc.fetchedAt instanceof Date ? doc.fetchedAt.toISOString() : doc.fetchedAt ?? ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}


function csvEscape(value: string): string {
  if (/[,"\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export default new WeatherService();
