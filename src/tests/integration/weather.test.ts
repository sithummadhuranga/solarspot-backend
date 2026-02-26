/**
 * Integration tests — Weather endpoints
 *
 * WeatherService is mocked at the module level because Member 1's Station model
 * hasn't been implemented yet (all schema fields are commented out in station.model.ts).
 * This lets us fully exercise the HTTP layer — routing, auth middleware, RBAC
 * middleware, request validation, and response shape — without depending on
 * Member 1's model being ready.
 *
 * When Member 1 ships the Station model, remove the WeatherService mock and add
 * real station documents to the DB to make these end-to-end.
 *
 * Owner: Member 3 · Ref: MASTER_PROMPT.md → Testing
 */

import request   from 'supertest';
import jwt        from 'jsonwebtoken';
import { Types }  from 'mongoose';
import app        from '../../../app';
import { connectTestDb, disconnectTestDb, seedCore } from './helpers';
import { User }   from '@modules/users/user.model';
import { Role }   from '@modules/permissions/role.model';

// ── Mock WeatherService (isolate from Station model dependency) ───────────────

jest.mock('@modules/weather/weather.service', () => ({
  default: {
    getCurrentWeather: jest.fn(),
    getForecast:       jest.fn(),
    getBestTimes:      jest.fn(),
    getSolarHeatmap:   jest.fn(),
    bulkRefresh:       jest.fn(),
    exportWeatherData: jest.fn(),
  },
}));

import WeatherService from '@modules/weather/weather.service';

const mockSvc = WeatherService as jest.Mocked<typeof WeatherService>;

// ── Test fixtures ─────────────────────────────────────────────────────────────

const stationId = new Types.ObjectId().toString();

const mockWeatherData = {
  stationId,
  fetchedAt:       new Date().toISOString(),
  temperature:     29.5,
  humidity:        78,
  cloudCover:      25,
  uvIndex:         5.2,
  solarIrradiance: 650,
  solarIndex:      'good',
  description:     'partly cloudy',
  icon:            '02d',
  windSpeed:       3.1,
};

const mockForecast = Array.from({ length: 8 }, (_, i) => ({
  timestamp:     new Date(Date.now() + i * 3 * 3600 * 1000).toISOString(),
  temperature:   27 + i,
  cloudCover:    20,
  uvIndex:       4,
  solarIndex:    'good',
  precipitation: 0,
}));

const mockBestTimes = [
  {
    date:       '2026-03-01',
    startHour:  10,
    endHour:    13,
    solarIndex: 'excellent',
    reason:     'Excellent solar conditions — UV 8, 10% cloud cover',
  },
];

const mockHeatmap = [
  { stationId, lat: 7.8, lng: 80.7, solarIndex: 'good', uvIndex: 4, cloudCover: 30 },
];

// ── Shared state ──────────────────────────────────────────────────────────────

let adminToken:   string;
let regularToken: string;

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  await connectTestDb();
  await seedCore();

  const jwtSecret = process.env.JWT_SECRET!;

  // Create an admin user so we can test RBAC-gated endpoints
  const adminRole   = await Role.findOne({ name: 'admin' }).lean();
  const userRole    = await Role.findOne({ name: 'user' }).lean();

  if (!adminRole || !userRole) {
    throw new Error('Integration test setup: roles not seeded correctly');
  }

  const adminUser = await User.create({
    displayName:     'Weather Admin',
    email:           `weather-admin-${Date.now()}@test.com`,
    password:        'hashed-irrelevant',
    role:            adminRole._id,
    isActive:        true,
    isEmailVerified: true,
    isBanned:        false,
  });

  const regularUser = await User.create({
    displayName:     'Regular User',
    email:           `weather-user-${Date.now()}@test.com`,
    password:        'hashed-irrelevant',
    role:            userRole._id,
    isActive:        true,
    isEmailVerified: true,
    isBanned:        false,
  });

  // Sign JWTs directly — we bypass the login flow to keep tests fast and isolated
  adminToken   = jwt.sign({ id: adminUser._id.toString() }, jwtSecret, { expiresIn: '15m' });
  regularToken = jwt.sign({ id: regularUser._id.toString() }, jwtSecret, { expiresIn: '15m' });
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(() => {
  jest.clearAllMocks();
  // Default: services return correct data
  mockSvc.getCurrentWeather.mockResolvedValue(mockWeatherData as never);
  mockSvc.getForecast.mockResolvedValue(mockForecast as never);
  mockSvc.getBestTimes.mockResolvedValue(mockBestTimes as never);
  mockSvc.getSolarHeatmap.mockResolvedValue(mockHeatmap as never);
  mockSvc.bulkRefresh.mockResolvedValue({ refreshed: 2, failed: 0 });
  mockSvc.exportWeatherData.mockResolvedValue({
    data:        JSON.stringify([mockWeatherData]),
    contentType: 'application/json',
    filename:    'solarspot-weather-2026-03-01.json',
  });
});

// ── GET /api/weather/heatmap ───────────────────────────────────────────────────

describe('GET /api/weather/heatmap', () => {
  it('200 — returns heatmap array without authentication', async () => {
    const res = await request(app).get('/api/weather/heatmap');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(mockSvc.getSolarHeatmap).toHaveBeenCalledTimes(1);
  });

  it('200 — returns empty array when no cached data exists', async () => {
    mockSvc.getSolarHeatmap.mockResolvedValue([]);

    const res = await request(app).get('/api/weather/heatmap');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ── GET /api/weather/:stationId ───────────────────────────────────────────────

describe('GET /api/weather/:stationId', () => {
  it('200 — returns current weather without authentication', async () => {
    const res = await request(app).get(`/api/weather/${stationId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.temperature).toBe(29.5);
    expect(res.body.data.solarIndex).toBe('good');
    expect(mockSvc.getCurrentWeather).toHaveBeenCalledWith(stationId);
  });

  it('422 — rejects a malformed (non-ObjectId) stationId', async () => {
    const res = await request(app).get('/api/weather/not-a-valid-id');

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('404 — propagates NOT_FOUND when service throws', async () => {
    const { default: ApiError } = await import('@utils/ApiError');
    mockSvc.getCurrentWeather.mockRejectedValue(ApiError.notFound('Station not found'));

    const res = await request(app).get(`/api/weather/${stationId}`);

    expect(res.status).toBe(404);
  });
});

// ── GET /api/weather/:stationId/forecast ─────────────────────────────────────

describe('GET /api/weather/:stationId/forecast', () => {
  it('200 — returns forecast array without authentication', async () => {
    const res = await request(app).get(`/api/weather/${stationId}/forecast`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(8);
  });

  it('422 — rejects a malformed stationId', async () => {
    const res = await request(app).get('/api/weather/abc/forecast');

    expect(res.status).toBe(422);
  });
});

// ── GET /api/weather/best-time/:stationId ─────────────────────────────────────

describe('GET /api/weather/best-time/:stationId', () => {
  it('200 — returns best-time slots without authentication', async () => {
    const res = await request(app).get(`/api/weather/best-time/${stationId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    res.body.data.forEach((slot: Record<string, unknown>) => {
      expect(slot).toHaveProperty('date');
      expect(slot).toHaveProperty('startHour');
      expect(slot).toHaveProperty('solarIndex');
      expect(slot).toHaveProperty('reason');
    });
  });

  it('422 — rejects a malformed stationId', async () => {
    const res = await request(app).get('/api/weather/best-time/short');

    expect(res.status).toBe(422);
  });
});

// ── POST /api/weather/bulk-refresh ────────────────────────────────────────────

describe('POST /api/weather/bulk-refresh', () => {
  it('401 — rejects request without a bearer token', async () => {
    const res = await request(app).post('/api/weather/bulk-refresh').send({});

    expect(res.status).toBe(401);
    expect(mockSvc.bulkRefresh).not.toHaveBeenCalled();
  });

  it('403 — regular user cannot trigger a bulk refresh', async () => {
    const res = await request(app)
      .post('/api/weather/bulk-refresh')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({});

    expect(res.status).toBe(403);
    expect(mockSvc.bulkRefresh).not.toHaveBeenCalled();
  });

  it('200 — admin can bulk-refresh all stations (stationIds omitted)', async () => {
    const res = await request(app)
      .post('/api/weather/bulk-refresh')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ force: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ refreshed: 2, failed: 0 });
  });

  it('200 — admin can refresh specific station IDs', async () => {
    const res = await request(app)
      .post('/api/weather/bulk-refresh')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stationIds: [stationId] });

    expect(res.status).toBe(200);
    expect(mockSvc.bulkRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ stationIds: [stationId] }),
    );
  });

  it('422 — rejects stationIds with more than 100 entries', async () => {
    const tooMany = Array.from({ length: 101 }, () => new Types.ObjectId().toString());

    const res = await request(app)
      .post('/api/weather/bulk-refresh')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stationIds: tooMany });

    expect(res.status).toBe(422);
    expect(mockSvc.bulkRefresh).not.toHaveBeenCalled();
  });
});

// ── GET /api/weather/export ────────────────────────────────────────────────────

describe('GET /api/weather/export', () => {
  it('401 — rejects request without a bearer token', async () => {
    const res = await request(app).get('/api/weather/export');

    expect(res.status).toBe(401);
  });

  it('403 — regular user cannot export data', async () => {
    const res = await request(app)
      .get('/api/weather/export')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('200 — admin can export JSON (default format)', async () => {
    const res = await request(app)
      .get('/api/weather/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
  });

  it('200 — admin can export CSV', async () => {
    mockSvc.exportWeatherData.mockResolvedValue({
      data:        'stationId,lat,lng\n' + stationId + ',7.8,80.7',
      contentType: 'text/csv',
      filename:    'solarspot-weather-2026-03-01.csv',
    });

    const res = await request(app)
      .get('/api/weather/export?format=csv')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('422 — rejects unknown query parameters via stripUnknown (format must be json|csv)', async () => {
    const res = await request(app)
      .get('/api/weather/export?format=xml')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(422);
  });
});
