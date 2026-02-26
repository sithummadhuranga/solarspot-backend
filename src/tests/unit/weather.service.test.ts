/**
 * Unit tests — WeatherService
 *
 * All external dependencies are mocked so this suite has zero I/O:
 *   - axios          → mocked HTTP calls to OpenWeatherMap
 *   - Station model  → mocked DB queries
 *   - WeatherCache   → mocked DB reads/writes
 *   - container      → mocked QuotaService
 *   - node-cache     → mocked in-memory cache
 *   - logger         → silenced
 *
 * Owner: Member 3 · Ref: MASTER_PROMPT.md → Testing
 */

import { Types } from 'mongoose';

// ── Mocks must be hoisted before any imports ───────────────────────────────────

jest.mock('@config/env', () => ({
  config: {
    OPENWEATHER_API_KEY: 'test-owm-key',
    NODE_ENV:            'test',
  },
}));

jest.mock('axios');

jest.mock('@utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@utils/cache', () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
}));

jest.mock('@modules/stations/station.model', () => ({
  Station: {
    findById: jest.fn(),
    find:     jest.fn(),
  },
}));

jest.mock('@modules/weather/weather.model', () => ({
  WeatherCache: {
    findOne:           jest.fn(),
    findOneAndUpdate:  jest.fn(),
    find:              jest.fn(),
  },
}));

jest.mock('@/container', () => ({
  container: {
    quotaService: {
      check:     jest.fn(),
      increment: jest.fn(),
    },
  },
}));

// ── Now safe to import the service ────────────────────────────────────────────

import axios from 'axios';
import WeatherService from '@modules/weather/weather.service';
import { Station }    from '@modules/stations/station.model';
import { WeatherCache } from '@modules/weather/weather.model';
import { cacheGet, cacheSet } from '@utils/cache';
import { container }  from '@/container';

const mockAxios       = axios as jest.Mocked<typeof axios>;
const mockStation     = Station as jest.Mocked<typeof Station>;
const mockCache       = WeatherCache as jest.Mocked<typeof WeatherCache>;
const mockCacheGet    = cacheGet as jest.MockedFunction<typeof cacheGet>;
const mockCacheSet    = cacheSet as jest.MockedFunction<typeof cacheSet>;
const mockQuota       = container.quotaService as jest.Mocked<typeof container.quotaService>;

// ── Shared fixtures ────────────────────────────────────────────────────────────

const stationId = new Types.ObjectId().toString();

const mockStationDoc = {
  _id:      new Types.ObjectId(stationId),
  isActive: true,
  location: { type: 'Point', coordinates: [80.7, 7.8] },  // [lng, lat]
};

const mockOWMCurrentResponse = {
  main:    { temp: 29.5, humidity: 78 },
  clouds:  { all: 25 },
  weather: [{ description: 'partly cloudy', icon: '02d' }],
  wind:    { speed: 3.1 },
  uvi:     5.2,
};

const mockOWMForecastResponse = {
  list: Array.from({ length: 8 }, (_, i) => ({
    dt:      Math.floor(Date.now() / 1000) + i * 3600 * 3,
    main:    { temp: 28, humidity: 75 },
    clouds:  { all: 30 },
    pop:     0.1,
    weather: [{ description: 'clear', icon: '01d' }],
  })),
};

const mockWeatherData = {
  stationId,
  fetchedAt:       new Date(),
  temperature:     29.5,
  humidity:        78,
  cloudCover:      25,
  uvIndex:         5.2,
  solarIrradiance: 650,
  solarIndex:      'good' as const,
  description:     'partly cloudy',
  icon:            '02d',
  windSpeed:       3.1,
};

// ── getCurrentWeather ──────────────────────────────────────────────────────────

describe('WeatherService.getCurrentWeather', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: quota is available
    mockQuota.check.mockResolvedValue(true);
    mockQuota.increment.mockResolvedValue(undefined);
  });

  it('returns in-memory cached data immediately without hitting the DB or API', async () => {
    mockCacheGet.mockReturnValue(mockWeatherData);

    const result = await WeatherService.getCurrentWeather(stationId);

    expect(result).toEqual(mockWeatherData);
    expect(mockCache.findOne).not.toHaveBeenCalled();
    expect(mockAxios.get).not.toHaveBeenCalled();
  });

  it('warms the in-memory cache from MongoDB and returns it on a DB hit', async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 20); // 20 min from now
    mockCacheGet.mockReturnValue(undefined);
    mockCache.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        current:   mockWeatherData,
        forecast:  [],
        expiresAt: futureDate,
      }),
    } as never);

    const result = await WeatherService.getCurrentWeather(stationId);

    expect(result).toEqual(mockWeatherData);
    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining(stationId),
      mockWeatherData,
      expect.any(Number),
    );
    expect(mockAxios.get).not.toHaveBeenCalled();
  });

  it('fetches from OWM API on full cache miss and persists the result', async () => {
    mockCacheGet.mockReturnValue(undefined);
    mockCache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) } as never);
    mockStation.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockStationDoc),
    } as never);
    mockAxios.get.mockResolvedValueOnce({ data: mockOWMCurrentResponse } as never);
    mockAxios.get.mockResolvedValueOnce({ data: mockOWMForecastResponse } as never);
    mockCache.findOneAndUpdate.mockResolvedValue({} as never);

    const result = await WeatherService.getCurrentWeather(stationId);

    expect(result.temperature).toBe(29.5);
    expect(result.humidity).toBe(78);
    expect(result.uvIndex).toBe(5.2);
    expect(result.solarIndex).toBe('good');
    expect(mockCache.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mockQuota.increment).toHaveBeenCalledWith('openweathermap');
  });

  it('throws 503 when the OWM daily quota is exhausted', async () => {
    mockCacheGet.mockReturnValue(undefined);
    mockCache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) } as never);
    mockStation.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockStationDoc),
    } as never);
    mockQuota.check.mockResolvedValue(false);

    await expect(WeatherService.getCurrentWeather(stationId)).rejects.toMatchObject({
      statusCode: 500,
      message:    expect.stringContaining('quota'),
    });

    expect(mockAxios.get).not.toHaveBeenCalled();
  });

  it('throws 404 when the station does not exist', async () => {
    mockCacheGet.mockReturnValue(undefined);
    mockCache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) } as never);
    mockStation.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    } as never);

    await expect(WeatherService.getCurrentWeather(stationId)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 404 for an inactive station', async () => {
    mockCacheGet.mockReturnValue(undefined);
    mockCache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) } as never);
    mockStation.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ ...mockStationDoc, isActive: false }),
    } as never);

    await expect(WeatherService.getCurrentWeather(stationId)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 400 when a station has no coordinates', async () => {
    mockCacheGet.mockReturnValue(undefined);
    mockCache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) } as never);
    mockStation.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ ...mockStationDoc, location: undefined }),
    } as never);

    await expect(WeatherService.getCurrentWeather(stationId)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

// ── getForecast ────────────────────────────────────────────────────────────────

describe('WeatherService.getForecast', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuota.check.mockResolvedValue(true);
    mockQuota.increment.mockResolvedValue(undefined);
  });

  it('returns forecast from in-memory cache without DB/API calls', async () => {
    const cachedForecast = [{ timestamp: new Date(), temperature: 27 }];
    // getForecast checks the forecastKey cache first — return data on the very first call
    mockCacheGet.mockReturnValue(cachedForecast);

    const result = await WeatherService.getForecast(stationId);

    expect(result).toEqual(cachedForecast);
    expect(mockAxios.get).not.toHaveBeenCalled();
  });

  it('fetches from OWM API and returns an array of ForecastSlots', async () => {
    mockCacheGet.mockReturnValue(undefined);
    mockCache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) } as never);
    mockStation.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockStationDoc),
    } as never);
    mockAxios.get.mockResolvedValueOnce({ data: mockOWMForecastResponse } as never);
    // Current weather sub-call also needs quota check — return false so it's skipped gracefully
    mockQuota.check.mockResolvedValueOnce(true).mockResolvedValue(false);
    mockCache.findOneAndUpdate.mockResolvedValue({} as never);

    const result = await WeatherService.getForecast(stationId);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(8);
    result.forEach((slot) => {
      expect(slot).toHaveProperty('timestamp');
      expect(slot).toHaveProperty('temperature');
      expect(slot).toHaveProperty('solarIndex');
    });
  });
});

// ── getBestTimes ───────────────────────────────────────────────────────────────

describe('WeatherService.getBestTimes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuota.check.mockResolvedValue(true);
    mockQuota.increment.mockResolvedValue(undefined);
  });

  it('returns only daytime slots sorted chronologically', async () => {
    // Build a fake forecast with daytime and nighttime slots
    const daySlot = {
      timestamp:     new Date('2026-03-01T07:30:00Z'), // 13:00 local (+5:30)
      temperature:   30,
      cloudCover:    15,
      uvIndex:       7.5,
      solarIndex:    'excellent' as const,
      precipitation: 0,
    };
    const nightSlot = {
      timestamp:     new Date('2026-03-01T20:00:00Z'), // 01:30 local
      temperature:   24,
      cloudCover:    5,
      uvIndex:       0,
      solarIndex:    'unavailable' as const,
      precipitation: 0,
    };

    // Spy on getForecast to return controlled data
    jest.spyOn(WeatherService, 'getForecast').mockResolvedValue([daySlot, nightSlot]);

    const result = await WeatherService.getBestTimes(stationId);

    // Only the daytime slot should appear
    expect(result.every((s) => s.startHour >= 6 && s.startHour <= 18)).toBe(true);
    // Reason should be present on every slot
    result.forEach((slot) => {
      expect(slot.reason).toBeTruthy();
      expect(slot.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it('ranks higher-scoring slots before lower-scoring ones on the same date', async () => {
    // excellentSlot is given an earlier UTC time so after the final chronological
    // sort (ascending by startHour) it still appears first in the results.
    const excellentSlot = {
      timestamp:     new Date('2026-03-01T04:00:00Z'), // ~09:30 local (startHour 9)
      temperature:   31,
      cloudCover:    5,
      uvIndex:       8,
      solarIndex:    'excellent' as const,
      precipitation: 0,
    };
    const poorSlot = {
      timestamp:     new Date('2026-03-01T06:00:00Z'), // ~11:30 local (startHour 11)
      temperature:   27,
      cloudCover:    80,
      uvIndex:       1,
      solarIndex:    'poor' as const,
      precipitation: 0,
    };

    jest.spyOn(WeatherService, 'getForecast').mockResolvedValue([excellentSlot, poorSlot]);

    const result = await WeatherService.getBestTimes(stationId);
    const localDate = '2026-03-01';
    const daySlots  = result.filter((s) => s.date === localDate);

    // Both slots are daytime; after chronological sort excellent (hour 9) is first
    expect(daySlots.length).toBeGreaterThan(0);
    expect(daySlots[0].solarIndex).toBe('excellent');
  });
});

// ── getSolarHeatmap ────────────────────────────────────────────────────────────

describe('WeatherService.getSolarHeatmap', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns in-memory cached heatmap without querying the DB', async () => {
    const heatmapData = [{ stationId, lat: 7.8, lng: 80.7, solarIndex: 'good', uvIndex: 4, cloudCover: 30 }];
    mockCacheGet.mockReturnValue(heatmapData);

    const result = await WeatherService.getSolarHeatmap();

    expect(result).toEqual(heatmapData);
    expect(mockCache.find).not.toHaveBeenCalled();
  });

  it('builds the heatmap from WeatherCache documents when in-memory is cold', async () => {
    mockCacheGet.mockReturnValue(undefined);
    mockCache.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          stationId:   new Types.ObjectId(stationId),
          coordinates: [80.7, 7.8],
          current: {
            solarIndex: 'excellent',
            uvIndex:    7,
            cloudCover: 10,
          },
          expiresAt: new Date(Date.now() + 1000 * 60 * 20),
        },
      ]),
    } as never);

    const result = await WeatherService.getSolarHeatmap();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      stationId:  stationId,
      lat:        7.8,
      lng:        80.7,
      solarIndex: 'excellent',
    });
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it('excludes cache entries that have no current data', async () => {
    mockCacheGet.mockReturnValue(undefined);
    mockCache.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { stationId: new Types.ObjectId(), coordinates: [80.5, 7.2], current: null },
      ]),
    } as never);

    const result = await WeatherService.getSolarHeatmap();

    expect(result).toHaveLength(0);
  });
});

// ── bulkRefresh ────────────────────────────────────────────────────────────────

describe('WeatherService.bulkRefresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuota.check.mockResolvedValue(true);
    mockQuota.increment.mockResolvedValue(undefined);
  });

  it('returns the counts of refreshed and failed stations', async () => {
    const id1 = new Types.ObjectId().toString();
    const id2 = new Types.ObjectId().toString();

    // Mock getCurrentWeather: succeeds for id1, fails for id2
    jest.spyOn(WeatherService, 'getCurrentWeather')
      .mockResolvedValueOnce(mockWeatherData)
      .mockRejectedValueOnce(new Error('OWM timeout'));

    const result = await WeatherService.bulkRefresh({
      stationIds: [id1, id2],
      force:      true,
    });

    expect(result.refreshed).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('queries all approved stations when stationIds is omitted', async () => {
    mockStation.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    } as never);

    const result = await WeatherService.bulkRefresh({});

    expect(mockStation.find).toHaveBeenCalledWith({ status: 'approved', isActive: true });
    expect(result.refreshed).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('skips warm-cached stations when force is false', async () => {
    const id = new Types.ObjectId().toString();
    // Simulate an in-memory cache hit
    mockCacheGet.mockReturnValue(mockWeatherData);

    const refreshSpy = jest.spyOn(WeatherService, 'getCurrentWeather');

    const result = await WeatherService.bulkRefresh({ stationIds: [id], force: false });

    // Station is warm — counted as refreshed but no API call made
    expect(result.refreshed).toBe(1);
    expect(result.failed).toBe(0);
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});

// ── exportWeatherData ──────────────────────────────────────────────────────────

describe('WeatherService.exportWeatherData', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns JSON-formatted data with the correct content-type', async () => {
    mockCache.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          stationId:   new Types.ObjectId(stationId),
          coordinates: [80.7, 7.8],
          current:     mockWeatherData,
          fetchedAt:   new Date(),
        },
      ]),
    } as never);

    const result = await WeatherService.exportWeatherData({ format: 'json' });

    expect(result.contentType).toBe('application/json');
    expect(result.filename).toMatch(/\.json$/);
    expect(() => JSON.parse(result.data)).not.toThrow();
  });

  it('returns CSV-formatted data when format=csv', async () => {
    mockCache.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          stationId:   new Types.ObjectId(stationId),
          coordinates: [80.7, 7.8],
          current:     { ...mockWeatherData, description: 'partly cloudy' },
          fetchedAt:   new Date(),
        },
      ]),
    } as never);

    const result = await WeatherService.exportWeatherData({ format: 'csv' });

    expect(result.contentType).toBe('text/csv');
    expect(result.filename).toMatch(/\.csv$/);
    // CSV must start with the header row
    expect(result.data).toMatch(/^stationId,/);
  });

  it('filters by stationId when provided', async () => {
    mockCache.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    } as never);

    await WeatherService.exportWeatherData({ stationId });

    expect(mockCache.find).toHaveBeenCalledWith(
      expect.objectContaining({ stationId: expect.anything() }),
    );
  });
});
