/**
 * Solar Weather Service — the ONLY place in the solar module that calls OWM.
 *
 * Responsibilities:
 *   1. Fetch live weather or forecast from OpenWeatherMap for a given coordinate pair.
 *   2. Apply the solar output formula (pure function — no side effects, fully testable).
 *   3. Select the best 3 charging windows from a forecast array.
 *
 * Caching strategy: simple in-process node-cache with 30-minute TTL.
 * On OWM failure the service logs a warning and throws a 503 with a descriptive
 * message so the caller can surface it gracefully to the user.
 *
 * Owner: Member 3 · Ref: SolarIntelligence_Module_Prompt.md → A2
 */

import axios          from 'axios';
import NodeCache      from 'node-cache';
import { config }     from '@config/env';
import logger         from '@utils/logger';
import ApiError       from '@utils/ApiError';

// ── Constants ─────────────────────────────────────────────────────────────────

const OWM_BASE              = 'https://api.openweathermap.org/data/2.5';
const CACHE_TTL_SECONDS     = 1800;   // 30 minutes — matches OWM free-tier recommendation
const SRI_LANKA_UTC_OFFSET  = 5.5;    // UTC+5:30
const MAX_UV_CLEAR_SKY      = 9;      // Peak UV in Sri Lanka on a clear equatorial day
const WIND_PENALTY_COEFF    = 0.005;  // 0.5% output loss per km/h of wind above 15 km/h
const TEMP_PENALTY_COEFF    = 0.003;  // 0.3% output loss per °C above 25 °C (panel heating)
const TOP_WINDOWS           = 3;      // Maximum best-window results

const weatherCache = new NodeCache({ stdTTL: CACHE_TTL_SECONDS, checkperiod: 120 });

// ── OWM wire types ────────────────────────────────────────────────────────────
// Kept private — callers use the exported domain interfaces below.

interface OWMCurrentResponse {
  main:    { temp: number; humidity: number };
  clouds:  { all: number };
  weather: [{ main: string; icon: string }];
  wind:    { speed: number };          // m/s from OWM
  uvi?:    number;
}

interface OWMForecastItem {
  dt:      number;                     // Unix timestamp
  main:    { temp: number };
  clouds:  { all: number };
  weather: [{ main: string; icon: string }];
  wind:    { speed: number };
}

interface OWMForecastResponse {
  list: OWMForecastItem[];
}

// ── Exported domain interfaces ────────────────────────────────────────────────

/** Live weather snapshot for a coordinate pair */
export interface WeatherSnapshot {
  cloudCoverPct:  number;
  uvIndex:        number;
  temperatureC:   number;
  windSpeedKph:   number;
  weatherMain:    string;
  weatherIcon:    string;
  capturedAt:     Date;
  isFallback?:    boolean;
}

/** Single forecast slot (3-hourly) */
export interface ForecastSlot {
  dt:             Date;
  cloudCoverPct:  number;
  temperatureC:   number;
  windSpeedKph:   number;
  weatherMain:    string;
  weatherIcon:    string;
  uvIndex:        number;  // estimated when OWM free tier doesn't return it
  estimatedOutputKw?: number;
  solarScore?:    number;
}

/** Result of the solar output formula for a given snapshot or slot */
export interface SolarCalculation {
  estimatedOutputKw: number;   // kW the panel is likely producing right now
  solarScore:        number;   // 0–10 index for UX display
  cloudReduction:    number;   // fraction 0–1: how much cloud cover is reducing output
  uvBoost:           number;   // fraction 0–1: how much UV is enhancing output
  efficiency:        number;   // overall efficiency fraction (0–1)
}

/** Top charging window from a forecast array */
export interface BestWindow {
  dt:               Date;
  estimatedOutputKw: number;
  solarScore:       number;
  cloudCoverPct:    number;
  weatherMain:      string;
  weatherIcon:      string;
  label:            string;   // human-readable: "Best", "Good", "Acceptable"
}

// ── UV estimation ─────────────────────────────────────────────────────────────

/**
 * Estimates UV index when OWM free tier doesn't supply it.
 * Uses solar elevation angle derived from local solar time (Sri Lanka UTC+5:30).
 * Intentionally simple — accurate enough for solar charging UX.
 */
function estimateUvIndex(utcTime: Date, cloudCoverPct: number): number {
  const utcHour    = utcTime.getUTCHours() + utcTime.getUTCMinutes() / 60;
  const localHour  = (utcHour + SRI_LANKA_UTC_OFFSET) % 24;
  const hoursFromNoon = Math.abs(localHour - 12.5);

  // Sri Lanka has ~12 hours of daylight; no meaningful UV before 6:00 or after 18:30
  if (hoursFromNoon > 6.25) return 0;

  const elevationFactor = Math.cos((hoursFromNoon / 6.25) * (Math.PI / 2));
  const cloudReduction  = 1 - (cloudCoverPct / 100) * 0.85;
  return Math.max(0, parseFloat((MAX_UV_CLEAR_SKY * elevationFactor * cloudReduction).toFixed(1)));
}

// ── Core solar formula ────────────────────────────────────────────────────────

/**
 * calculateSolarOutput — pure function, no side effects.
 *
 * Formula:
 *   cloudReduction  = 1 − (cloudCoverPct / 100) × 0.75
 *   uvBoost         = min(uvIndex / 5, 1.0)                (saturates at UV 5)
 *   tempPenalty     = max(0, (temperatureC − 25) × TEMP_PENALTY_COEFF)
 *   windPenalty     = max(0, (windSpeedKph − 15) × WIND_PENALTY_COEFF)
 *   efficiency      = cloudReduction × uvBoost × (1 − tempPenalty) × (1 − windPenalty)
 *   estimatedKw     = solarPanelKw × efficiency               (rounded 2dp)
 *   solarScore      = round(efficiency × 10)                  (0–10 integer)
 *
 * The formula favours readability over numerical precision because the inputs
 * (OWM free tier) are themselves ±15% accurate. Refinements should be driven
 * by real accuracy data from SolarReports, not by algorithm complexity.
 */
export function calculateSolarOutput(
  solarPanelKw: number,
  weather: Pick<WeatherSnapshot | ForecastSlot, 'cloudCoverPct' | 'uvIndex' | 'temperatureC' | 'windSpeedKph'>,
): SolarCalculation {
  const cloudReduction = 1 - (weather.cloudCoverPct / 100) * 0.75;
  const uvBoost        = Math.min(weather.uvIndex / 5, 1.0);
  const tempPenalty    = Math.max(0, (weather.temperatureC - 25) * TEMP_PENALTY_COEFF);
  const windPenalty    = Math.max(0, (weather.windSpeedKph - 15) * WIND_PENALTY_COEFF);

  const efficiency      = cloudReduction * uvBoost * (1 - tempPenalty) * (1 - windPenalty);
  const estimatedOutputKw = Math.round(solarPanelKw * efficiency * 100) / 100;
  const solarScore        = Math.round(Math.max(0, Math.min(10, efficiency * 10)));

  return { estimatedOutputKw, solarScore, cloudReduction, uvBoost, efficiency };
}

// ── Best charging windows ─────────────────────────────────────────────────────

const WINDOW_LABELS: Record<number, string> = { 0: 'Best', 1: 'Good', 2: 'Acceptable' };

/**
 * getBestChargingWindows — filters daytime slots, scores them, returns top 3.
 *
 * Only slots where uvIndex > 0 (i.e. daytime) are considered.
 * Returns an empty array when given an empty input — never throws.
 */
export function getBestChargingWindows(slots: ForecastSlot[], solarPanelKw: number): BestWindow[] {
  const daytimeSlots = slots.filter((s) => s.uvIndex > 0);

  const scored = daytimeSlots.map((slot) => {
    const calc = calculateSolarOutput(solarPanelKw, slot);
    return {
      dt:               slot.dt,
      estimatedOutputKw: calc.estimatedOutputKw,
      solarScore:       calc.solarScore,
      cloudCoverPct:    slot.cloudCoverPct,
      weatherMain:      slot.weatherMain,
      weatherIcon:      slot.weatherIcon,
    };
  });

  scored.sort((a, b) => b.solarScore - a.solarScore || b.estimatedOutputKw - a.estimatedOutputKw);

  return scored.slice(0, TOP_WINDOWS).map((w, idx) => ({
    ...w,
    label: WINDOW_LABELS[idx] ?? 'Acceptable',
  }));
}

// ── OWM API calls ─────────────────────────────────────────────────────────────

/**
 * getCurrentWeather — fetches live conditions for a coordinate pair.
 *
 * Cache key: `solar:weather:current:{lat.3dp}:{lng.3dp}`
 * Throws ApiError 503 on OWM failure (quota exhausted or network error).
 */
export async function getCurrentWeather(lat: number, lng: number): Promise<WeatherSnapshot> {
  const key = `solar:weather:current:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cached = weatherCache.get<WeatherSnapshot>(key);
  if (cached) return cached;

  try {
    const { data } = await axios.get<OWMCurrentResponse>(`${OWM_BASE}/weather`, {
      params: {
        lat,
        lon:   lng,
        appid: config.OPENWEATHER_API_KEY,
        units: 'metric',
      },
      timeout: 8000,
    });

    const capturedAt = new Date();
    const snapshot: WeatherSnapshot = {
      cloudCoverPct: data.clouds.all,
      uvIndex:       data.uvi ?? estimateUvIndex(capturedAt, data.clouds.all),
      temperatureC:  data.main.temp,
      windSpeedKph:  Math.round(data.wind.speed * 3.6 * 10) / 10,  // m/s → km/h
      weatherMain:   data.weather[0].main,
      weatherIcon:   data.weather[0].icon,
      capturedAt,
      isFallback:    data.uvi === undefined,
    };

    weatherCache.set(key, snapshot);
    return snapshot;
  } catch (err) {
    logger.warn('Solar weather service: OWM /weather call failed — returning 503', { err });
    throw new ApiError(503, 'Weather data temporarily unavailable. Please try again shortly.');
  }
}

/**
 * getForecast — fetches and annotates the 5-day / 3-hourly forecast.
 *
 * Cache key: `solar:weather:forecast:{lat.3dp}:{lng.3dp}`
 */
export async function getForecast(lat: number, lng: number): Promise<ForecastSlot[]> {
  const key = `solar:weather:forecast:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cached = weatherCache.get<ForecastSlot[]>(key);
  if (cached) return cached;

  try {
    const { data } = await axios.get<OWMForecastResponse>(`${OWM_BASE}/forecast`, {
      params: {
        lat,
        lon:   lng,
        appid: config.OPENWEATHER_API_KEY,
        units: 'metric',
        cnt:   40,          // 5 days × 8 slots/day (3-hourly)
      },
      timeout: 8000,
    });

    const slots: ForecastSlot[] = data.list.map((item) => {
      const dt = new Date(item.dt * 1000);
      return {
        dt,
        cloudCoverPct: item.clouds.all,
        temperatureC:  item.main.temp,
        windSpeedKph:  Math.round(item.wind.speed * 3.6 * 10) / 10,
        weatherMain:   item.weather[0].main,
        weatherIcon:   item.weather[0].icon,
        uvIndex:       estimateUvIndex(dt, item.clouds.all),
      };
    });

    weatherCache.set(key, slots);
    return slots;
  } catch (err) {
    logger.warn('Solar weather service: OWM /forecast call failed — returning 503', { err });
    throw new ApiError(503, 'Forecast data temporarily unavailable. Please try again shortly.');
  }
}

// ── Exported service object ───────────────────────────────────────────────────

export const solarWeatherService = {
  getCurrentWeather,
  getForecast,
  calculateSolarOutput,
  getBestChargingWindows,
};
