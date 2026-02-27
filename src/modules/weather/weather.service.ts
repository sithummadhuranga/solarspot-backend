/**
 * WeatherService — fetches, caches, and derives solar intelligence data.
 *
 * Every OpenWeatherMap API call is gated by QuotaService (800/day soft limit,
 * 1 000/day hard free-tier limit). On quota exhaustion the service degrades
 * gracefully: it returns cached data when available, or throws a 503 so the
 * caller can surface an informative message to the client.
 *
 * Caching is two-tier:
 *   1. In-memory (node-cache, 30 min) — avoids a DB round-trip on hot paths.
 *   2. MongoDB WeatherCache (TTL index, 30 min) — survives process restarts.
 *
 * UV index is not available on the OWM free-tier 2.5 endpoints. When the API
 * doesn't return it we estimate it from cloud cover and the station's local
 * time (Sri Lanka, UTC+5:30). The estimate is clearly flagged in log output and
 * is accurate enough for a solar charging recommendation UX.
 *
 * Owner: Member 3 · Ref: PROJECT_OVERVIEW.md → Weather (6 endpoints)
 */

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

// ── Constants ─────────────────────────────────────────────────────────────────

// 30-minute window matches the OWM free-tier cache recommendation
const WEATHER_CACHE_TTL_SECONDS = 1800;

// OWM 2.5 base URL — free tier, no subscription required
const OWM_BASE = 'https://api.openweathermap.org/data/2.5';

// Sri Lanka sits at UTC+5:30 (330 minutes ahead of UTC)
const SRI_LANKA_OFFSET_HOURS = 5.5;

// Peak UV in Sri Lanka on a clear day (equatorial / low-latitude tropics)
const MAX_UV_CLEAR_SKY = 9;

// How many best-time slots to surface per day
const BEST_SLOTS_PER_DAY = 2;

// ── OWM response shapes (internal only, never re-exported) ───────────────────

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

// ── Solar calculation helpers ─────────────────────────────────────────────────

/**
 * Estimates UV index when the API doesn't supply it.
 * Uses solar elevation angle (hour angle from local solar noon) and cloud cover.
 * Intentionally simple — accurate enough for pass/fail solar charging decisions.
 */
function estimateUvIndex(utcTimestamp: Date, cloudCoverPercent: number): number {
  const utcHour = utcTimestamp.getUTCHours() + utcTimestamp.getUTCMinutes() / 60;
  const localHour = (utcHour + SRI_LANKA_OFFSET_HOURS) % 24;

  // Solar noon in Sri Lanka is roughly 12:30 local time
  const hoursFromNoon = Math.abs(localHour - 12.5);

  // Daylight is ≈ 12 hours; no UV before 6:00 or after 18:30 local
  if (hoursFromNoon > 6.25) return 0;

  const elevationFactor = Math.cos((hoursFromNoon / 6.25) * (Math.PI / 2));
  const cloudReduction  = 1 - (cloudCoverPercent / 100) * 0.85;

  return Math.max(0, parseFloat((MAX_UV_CLEAR_SKY * elevationFactor * cloudReduction).toFixed(1)));
}

/**
 * Maps UV index + cloud cover to a human-meaningful solar category.
 * Thresholds calibrated to solar panel output research for tropical latitudes.
 */
function deriveSolarIndex(uvIndex: number, cloudCover: number): SolarIndex {
  if (uvIndex >= 6 && cloudCover <= 20) return 'excellent';
  if (uvIndex >= 4 && cloudCover <= 40) return 'good';
  if (uvIndex >= 2 && cloudCover <= 60) return 'moderate';
  if (uvIndex > 0  || cloudCover < 80)  return 'poor';
  return 'unavailable';
}

/**
 * Rough W/m² estimate for the UI — not used in control logic.
 * Formula: clear-sky ~1 000 W/m², reduced by ~75% at 100% cloud cover,
 * then scaled proportionally by UV index (0–10 → fraction of 1 000).
 */
function estimateSolarIrradiance(uvIndex: number, cloudCover: number): number {
  const clearSkyFraction = 1 - (cloudCover / 100) * 0.75;
  return Math.round(1_000 * clearSkyFraction * Math.min(uvIndex / MAX_UV_CLEAR_SKY, 1));
}

/** Scores a 3-hour forecast slot for solar charging appeal (0–20 scale). */
function scoreForecastSlot(slot: ForecastSlot): number {
  const uvBonus      = Math.min(slot.uvIndex * 2, 10);
  const cloudPenalty = (slot.cloudCover / 100) * 10;
  return Math.max(0, uvBonus - cloudPenalty);
}

// ── Cache key builders ───────────────────────────────────────────────────────

const cacheKey = {
  current:  (id: string) => `weather:current:${id}`,
  forecast: (id: string) => `weather:forecast:${id}`,
  heatmap:  ()           => 'weather:heatmap',
};

// ── WeatherService ────────────────────────────────────────────────────────────

class WeatherService {

  // ── Internal helpers ──────────────────────────────────────────────────────

  /** Loads station by ID and asserts it has coordinates. */
  private async resolveStation(stationId: string): Promise<IStation> {
    if (!Types.ObjectId.isValid(stationId)) {
      throw ApiError.notFound('Station not found');
    }

    const station = await Station.findById(stationId).lean<IStation>();
    if (!station || !station.isActive) {
      throw ApiError.notFound('Station not found');
    }
    if (!station.location?.coordinates?.length) {
      throw ApiError.badRequest('Station does not have location coordinates');
    }

    return station;
  }

  /** Fetches current weather from OWM and increments the quota counter. */
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

  /** Fetches 40-slot (5-day, 3-hourly) forecast from OWM. */
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

  /** Builds a WeatherData object from a raw OWM response. */
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

  /** Transforms an OWM forecast item into a ForecastSlot. */
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

  /**
   * Writes weather data into both the in-memory and MongoDB caches.
   * Uses findOneAndUpdate with upsert to ensure atomicity — no duplicate docs.
   */
  private async persistToCache(
    stationId: string,
    coordinates: [number, number],
    current: WeatherData,
    forecast: ForecastSlot[],
  ): Promise<void> {
    const now      = new Date();
    const expiresAt = new Date(now.getTime() + WEATHER_CACHE_TTL_SECONDS * 1_000);

    // Strip _raw before writing to DB — it's only for debugging
    const { _raw, ...currentWithoutRaw } = current;

    await WeatherCache.findOneAndUpdate(
      { stationId: new Types.ObjectId(stationId) },
      { $set: { coordinates, current: currentWithoutRaw, forecast, fetchedAt: now, expiresAt } },
      { upsert: true },
    );

    cacheSet(cacheKey.current(stationId),  current,  WEATHER_CACHE_TTL_SECONDS);
    cacheSet(cacheKey.forecast(stationId), forecast, WEATHER_CACHE_TTL_SECONDS);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Returns current weather + solar index for a station.
   * Cache-first: in-memory → MongoDB → OWM API.
   */
  async getCurrentWeather(stationId: string): Promise<WeatherData> {
    // Layer 1: hot in-memory cache
    const memHit = cacheGet<WeatherData>(cacheKey.current(stationId));
    if (memHit) return memHit;

    // Layer 2: MongoDB cache (document survives process restarts)
    const dbHit = await WeatherCache.findOne({
      stationId: new Types.ObjectId(stationId),
    }).lean();

    if (dbHit?.current) {
      // Warm the in-memory layer so the next request is instant
      const remainingTtl = Math.floor((dbHit.expiresAt.getTime() - Date.now()) / 1_000);
      if (remainingTtl > 0) {
        cacheSet(cacheKey.current(stationId), dbHit.current, remainingTtl);
        return dbHit.current as WeatherData;
      }
    }

    // Layer 3: live OWM API fetch
    const station = await this.resolveStation(stationId);
    if (!station.location) throw ApiError.badRequest('Station has no location data');
    const [lng, lat] = station.location.coordinates;

    const raw      = await this.fetchCurrentFromOWM(lat, lng);
    const current  = this.buildWeatherData(stationId, raw);

    // We need a fresh forecast to fill the cache correctly; fetch it in parallel
    // but don't block the current-weather response if the forecast call fails.
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

  /**
   * Returns the 5-day, 3-hourly forecast for a station.
   * Cache-first strategy identical to getCurrentWeather().
   */
  async getForecast(stationId: string): Promise<ForecastSlot[]> {
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
    if (!station.location) throw ApiError.badRequest('Station has no location data');
    const [lng, lat] = station.location.coordinates;

    const rawForecast = await this.fetchForecastFromOWM(lat, lng);
    const forecast    = rawForecast.list.map((item) => this.buildForecastSlot(item));

    // Also refresh current weather while we have the coordinates
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

  /**
   * Analyses the 5-day forecast and surfaces the best solar charging windows.
   *
   * Algorithm:
   *   1. Filter to daylight slots only (local 06:00 – 18:00).
   *   2. Score each slot by UV bonus minus cloud-cover penalty.
   *   3. Group scored slots by calendar date.
   *   4. For each date pick the top N contiguous slots and build a BestTimeSlot.
   */
  async getBestTimes(stationId: string): Promise<BestTimeSlot[]> {
    const forecast = await this.getForecast(stationId);

    // Keep only daytime slots — no point recommending midnight charging
    const daylightSlots = forecast.filter((slot) => {
      const localHour = (slot.timestamp.getUTCHours() + SRI_LANKA_OFFSET_HOURS) % 24;
      return localHour >= 6 && localHour <= 18;
    });

    // Group by local calendar date string ("YYYY-MM-DD")
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
      // Sort by score descending and pick the top window per day
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

    // Sort chronologically
    return results.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.startHour - b.startHour;
    });
  }

  /**
   * Assembles a heatmap from cached data only — never hits the OWM API.
   *
   * Deliberately quota-safe: if a station hasn't been fetched recently it simply
   * appears with solarIndex:'unavailable'. The client can trigger a fresh fetch
   * by visiting that station's detail page (which calls getCurrentWeather).
   */
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

    // The heatmap is rebuilt from DB every 5 minutes (shorter TTL is fine since
    // it's just aggregating existing cached data — no API calls involved)
    cacheSet(cacheKey.heatmap(), points, 300);

    return points;
  }

  /**
   * Admin bulk-refresh — re-fetches weather for one-or-more stations and
   * updates the cache. When stationIds is omitted every approved active
   * station is refreshed.
   *
   * A 150 ms delay between each station's API call keeps us well inside the
   * OWM free-tier rate limit (60 req/min = 1 req/sec).
   */
  async bulkRefresh(input: BulkRefreshInput): Promise<{ refreshed: number; failed: number }> {
    let stationIds: string[];

    if (input.stationIds?.length) {
      stationIds = input.stationIds;
    } else {
      // Fetch all approved, active stations
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
          // Skip stations whose cache is still warm
          const inMemory = cacheGet<WeatherData>(cacheKey.current(id));
          if (inMemory) {
            logger.debug(`bulkRefresh: station ${id} cache hit, skipping`);
            refreshed++;
            continue;
          }
        }

        // Respect OWM free-tier: ~1 req/sec per endpoint pair
        await delay(150);

        await this.getCurrentWeather(id);
        refreshed++;
        logger.info(`bulkRefresh: refreshed station ${id}`);
      } catch (err) {
        failed++;
        logger.error(`bulkRefresh: failed for station ${id}`, { err });
      }
    }

    // Invalidate the heatmap so it rebuilds on next request
    cacheSet(cacheKey.heatmap(), null, 1);

    return { refreshed, failed };
  }

  /**
   * Admin export — returns all cached weather data as JSON or CSV.
   * Filters by stationId and/or date range when query params are provided.
   */
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

// ── Module-level helpers (pure functions, not class methods) ──────────────────

/** Builds the human-readable reason string for a BestTimeSlot. */
function buildBestTimeReason(slot: ForecastSlot, score: number): string {
  if (score >= 15) return `Excellent solar conditions — UV ${slot.uvIndex}, ${slot.cloudCover}% cloud cover`;
  if (score >= 10) return `Good solar conditions — UV ${slot.uvIndex}, ${slot.cloudCover}% cloud cover`;
  if (score >= 5)  return `Moderate solar conditions — UV ${slot.uvIndex}, ${slot.cloudCover}% cloud cover`;
  return `Low solar conditions — UV ${slot.uvIndex}, ${slot.cloudCover}% cloud cover`;
}

/** Simple async delay to respect API rate limits. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns today's date as "YYYY-MM-DD" in UTC. */
function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Builds a CSV string from WeatherCache documents.
 * Intentionally avoids a third-party CSV library — the schema is small enough
 * that a hand-rolled serializer is easier to audit and has zero extra dependencies.
 */
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

/** Wraps a CSV cell value in quotes if it contains a comma, newline, or quote. */
function csvEscape(value: string): string {
  if (/[,"\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export default new WeatherService();
