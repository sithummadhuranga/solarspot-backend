

import axios from 'axios';
import NodeCache from 'node-cache';
import { config } from '@config/env';
import logger from '@utils/logger';

const OWM_BASE = 'https://api.openweathermap.org/data/2.5';
const CURRENT_WEATHER_TTL_SECONDS = 900;
const FORECAST_TTL_SECONDS = 3600;
const TOP_WINDOWS = 3;

const weatherCache = new NodeCache({ stdTTL: CURRENT_WEATHER_TTL_SECONDS, checkperiod: 120 });

interface OWMCurrentResponse {
  main: { temp: number };
  clouds: { all: number };
  weather: [{ main: string; icon: string }];
  wind: { speed: number };
}

interface OWMForecastItem {
  dt: number;
  dt_txt: string;
  main: { temp: number };
  clouds: { all: number };
  weather: [{ main: string; icon: string }];
  wind: { speed: number };
}

interface OWMForecastResponse {
  list: OWMForecastItem[];
}

export interface WeatherSnapshot {
  cloudCoverPct: number;
  uvIndex: number;
  temperatureC: number;
  windSpeedKph: number;
  weatherMain: string;
  weatherIcon: string;
  capturedAt: Date;
  isFallback?: boolean;
}

export interface ForecastSlot {
  dt: string;
  cloudCoverPct: number;
  temperatureC: number;
  windSpeedKph: number;
  weatherMain: string;
  weatherIcon: string;
  uvIndex: number;
  estimatedOutputKw?: number;
  solarScore?: number;
}

export interface SolarCalculation {
  estimatedOutputKw: number;
  solarScore: number;
  cloudFactor: number;
  uvFactor: number;
  efficiency: number;
}

export interface BestWindow {
  dt: string;
  estimatedOutputKw: number;
  solarScore: number;
  cloudCoverPct: number;
  weatherMain: string;
  weatherIcon: string;
  label: string;
}

const WINDOW_LABELS: Record<number, string> = {
  0: 'Best',
  1: '2nd Best',
  2: '3rd Best',
};

function buildFallbackWeather(): WeatherSnapshot {
  return {
    cloudCoverPct: 50,
    uvIndex: 3,
    temperatureC: 25,
    windSpeedKph: 10,
    weatherMain: 'Unknown',
    weatherIcon: '01d',
    capturedAt: new Date(),
    isFallback: true,
  };
}

export function calculateSolarOutput(
  solarPanelKw: number,
  weather: Pick<WeatherSnapshot | ForecastSlot, 'cloudCoverPct' | 'uvIndex' | 'temperatureC' | 'windSpeedKph'>,
): SolarCalculation {
  const cloudFactor = 1 - (weather.cloudCoverPct / 100);
  const uvFactor = Math.min(weather.uvIndex / 10, 1);
  const efficiency = 0.85;
  const estimatedOutputKw = Number(
    Math.max(0, solarPanelKw * cloudFactor * uvFactor * efficiency).toFixed(2),
  );
  const solarScore = solarPanelKw > 0
    ? Math.min(100, Math.round((estimatedOutputKw / solarPanelKw) * 100))
    : 0;

  return { estimatedOutputKw, solarScore, cloudFactor, uvFactor, efficiency };
}

export function getBestChargingWindows(slots: ForecastSlot[], solarPanelKw: number): BestWindow[] {
  const scored = slots
    .map((slot) => {
      const calc = calculateSolarOutput(solarPanelKw, slot);
      return {
        dt: slot.dt,
        estimatedOutputKw: calc.estimatedOutputKw,
        solarScore: calc.solarScore,
        cloudCoverPct: slot.cloudCoverPct,
        weatherMain: slot.weatherMain,
        weatherIcon: slot.weatherIcon,
      };
    })
    .filter((slot) => slot.estimatedOutputKw > 0 && slot.solarScore > 0)
    .sort((left, right) => (
      right.estimatedOutputKw - left.estimatedOutputKw
      || right.solarScore - left.solarScore
    ));

  const selected: BestWindow[] = [];

  for (const candidate of scored) {
    if (selected.length >= TOP_WINDOWS) break;

    const candidateTime = new Date(candidate.dt).getTime();
    const overlaps = selected.some((window) => {
      const selectedTime = new Date(window.dt).getTime();
      return Math.abs(candidateTime - selectedTime) < 180 * 60 * 1000;
    });

    if (!overlaps) {
      selected.push({
        ...candidate,
        label: WINDOW_LABELS[selected.length] ?? 'Best Window',
      });
    }
  }

  return selected;
}

export async function getCurrentWeather(lat: number, lng: number): Promise<WeatherSnapshot> {
  const cacheKey = `weather:current:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cached = weatherCache.get<WeatherSnapshot>(cacheKey);
  if (cached) return cached;

  if (!config.OPENWEATHER_API_KEY) {
    const fallback = buildFallbackWeather();
    weatherCache.set(cacheKey, fallback, CURRENT_WEATHER_TTL_SECONDS);
    return fallback;
  }

  try {
    const { data } = await axios.get<OWMCurrentResponse>(`${OWM_BASE}/weather`, {
      params: {
        lat,
        lon: lng,
        appid: config.OPENWEATHER_API_KEY,
        units: 'metric',
      },
      timeout: 8000,
    });

    const snapshot: WeatherSnapshot = {
      cloudCoverPct: data.clouds.all,
      uvIndex: 3,
      temperatureC: data.main.temp,
      windSpeedKph: Number((data.wind.speed * 3.6).toFixed(1)),
      weatherMain: data.weather[0].main,
      weatherIcon: data.weather[0].icon,
      capturedAt: new Date(),
    };

    weatherCache.set(cacheKey, snapshot, CURRENT_WEATHER_TTL_SECONDS);
    return snapshot;
  } catch (err) {
    logger.warn('Solar weather service: current weather fetch failed; using fallback', {
      err,
      lat,
      lng,
    });
    const fallback = buildFallbackWeather();
    weatherCache.set(cacheKey, fallback, CURRENT_WEATHER_TTL_SECONDS);
    return fallback;
  }
}

export async function getForecast(lat: number, lng: number): Promise<ForecastSlot[]> {
  const cacheKey = `weather:forecast:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cached = weatherCache.get<ForecastSlot[]>(cacheKey);
  if (cached) return cached;

  if (!config.OPENWEATHER_API_KEY) {
    return [];
  }

  try {
    const { data } = await axios.get<OWMForecastResponse>(`${OWM_BASE}/forecast`, {
      params: {
        lat,
        lon: lng,
        appid: config.OPENWEATHER_API_KEY,
        units: 'metric',
        cnt: 16,
      },
      timeout: 8000,
    });

    const mapped = data.list.map((item) => ({
      dt: new Date(item.dt_txt).toISOString(),
      cloudCoverPct: item.clouds.all,
      temperatureC: item.main.temp,
      windSpeedKph: Number((item.wind.speed * 3.6).toFixed(1)),
      weatherMain: item.weather[0].main,
      weatherIcon: item.weather[0].icon,
      uvIndex: 3,
    }));

    weatherCache.set(cacheKey, mapped, FORECAST_TTL_SECONDS);
    return mapped;
  } catch (err) {
    logger.warn('Solar weather service: forecast fetch failed; returning empty array', {
      err,
      lat,
      lng,
    });
    return [];
  }
}

export const solarWeatherService = {
  getCurrentWeather,
  getForecast,
  calculateSolarOutput,
  getBestChargingWindows,
};
