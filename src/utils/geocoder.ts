import axios from 'axios';
import NodeCache from 'node-cache';
import logger from './logger';

// ─── Constants ────────────────────────────────────────────────────────────────
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'SolarSpot/1.0';
const REQUEST_TIMEOUT_MS = 10_000;

const geocodeCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NominatimAddressParts {
  street: string | null;
  city: string | null;
  district: string | null;
  country: string | null;
  postalCode: string | null;
  formattedAddress: string | null;
}

export interface GeoResult extends NominatimAddressParts {
  lat: number;
  lng: number;
}

interface NominatimSearchItem {
  lat: string;
  lon: string;
  display_name: string;
  address: Record<string, string>;
}

interface NominatimReverseResult {
  lat: string;
  lon: string;
  display_name: string;
  address: Record<string, string>;
  error?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function parseAddressParts(
  raw: Record<string, string>,
  displayName: string
): NominatimAddressParts {
  return {
    street: raw.road ?? raw.pedestrian ?? raw.footway ?? raw.path ?? null,
    city:
      raw.city ??
      raw.town ??
      raw.municipality ??
      raw.village ??
      raw.hamlet ??
      null,
    district:
      raw.county ??
      raw.state_district ??
      raw.district ??
      raw.suburb ??
      raw.borough ??
      null,
    country: raw.country ?? null,
    postalCode: raw.postcode ?? null,
    formattedAddress: displayName ?? null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * forwardGeocode — converts a human-readable address string to coordinates
 * plus structured address parts.
 *
 * Uses Nominatim Search API:
 *   GET https://nominatim.openstreetmap.org/search?q=<address>&format=json
 *
 * Results are cached for 24 hours per unique query string.
 * A 1-second delay is applied before each uncached request to respect
 * Nominatim's usage policy (max 1 req/s).
 *
 * @param address  Free-form address string, e.g. "123 Main St, Colombo"
 * @returns GeoResult or null if the address cannot be resolved.
 */
export async function forwardGeocode(address: string): Promise<GeoResult | null> {
  const normalised = address.toLowerCase().trim();
  const cacheKey = `fw:${normalised}`;

  const cached = geocodeCache.get<GeoResult>(cacheKey);
  if (cached) {
    logger.debug(`[geocoder] forwardGeocode cache HIT for "${address}"`);
    return cached;
  }

  // Respect Nominatim 1 req/sec policy
  await sleep(1000);

  try {
    const url =
      `${NOMINATIM_BASE}/search` +
      `?q=${encodeURIComponent(address)}` +
      `&format=json&limit=1&addressdetails=1`;

    const { data } = await axios.get<NominatimSearchItem[]>(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: REQUEST_TIMEOUT_MS,
    });

    if (!Array.isArray(data) || data.length === 0) {
      logger.warn(`[geocoder] forwardGeocode: no results for "${address}"`);
      return null;
    }

    const first = data[0];
    const result: GeoResult = {
      lat: parseFloat(first.lat),
      lng: parseFloat(first.lon),
      ...parseAddressParts(first.address ?? {}, first.display_name),
    };

    geocodeCache.set(cacheKey, result);
    logger.debug(
      `[geocoder] forwardGeocode resolved "${address}" → ${result.lat},${result.lng}`
    );
    return result;
  } catch (err: unknown) {
    logger.warn('[geocoder] forwardGeocode request failed', {
      address,
      error: (err as Error).message,
    });
    return null;
  }
}

/**
 * reverseGeocode — converts a lat/lng pair to structured address parts.
 *
 * Uses Nominatim Reverse API:
 *   GET https://nominatim.openstreetmap.org/reverse?lat=<lat>&lon=<lng>&format=json
 *
 * Results are cached for 24 hours per coordinate pair (6 d.p.).
 * A 1-second delay is applied before each uncached request.
 *
 * @param lat  Latitude  (decimal degrees, WGS-84)
 * @param lng  Longitude (decimal degrees, WGS-84)
 * @returns GeoResult or null if the coordinates cannot be resolved.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult | null> {
  const cacheKey = `rv:${lat.toFixed(6)},${lng.toFixed(6)}`;

  const cached = geocodeCache.get<GeoResult>(cacheKey);
  if (cached) {
    logger.debug(`[geocoder] reverseGeocode cache HIT for ${lat},${lng}`);
    return cached;
  }

  // Respect Nominatim 1 req/sec policy
  await sleep(1000);

  try {
    const url =
      `${NOMINATIM_BASE}/reverse` +
      `?lat=${lat}&lon=${lng}` +
      `&format=json&addressdetails=1`;

    const { data } = await axios.get<NominatimReverseResult>(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: REQUEST_TIMEOUT_MS,
    });

    if (!data || data.error || !data.lat) {
      logger.warn(`[geocoder] reverseGeocode: no result for ${lat},${lng}`);
      return null;
    }

    const result: GeoResult = {
      lat: parseFloat(data.lat),
      lng: parseFloat(data.lon),
      ...parseAddressParts(data.address ?? {}, data.display_name),
    };

    geocodeCache.set(cacheKey, result);
    logger.debug(
      `[geocoder] reverseGeocode resolved ${lat},${lng} → "${result.formattedAddress}"`
    );
    return result;
  } catch (err: unknown) {
    logger.warn('[geocoder] reverseGeocode request failed', {
      lat,
      lng,
      error: (err as Error).message,
    });
    return null;
  }
}
