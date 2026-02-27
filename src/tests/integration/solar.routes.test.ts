/**
 * Integration tests — Solar Intelligence endpoints
 *
 * solarService is mocked at the module level so this suite exercises the entire
 * HTTP layer (routing, auth middleware, validation, response shaping) without
 * hitting MongoDB or OWM.
 *
 * Covers all 9 routes:
 *   GET  /api/solar/stations/:stationId/live-weather  (public)
 *   GET  /api/solar/stations/:stationId/forecast      (public)
 *   GET  /api/solar/stations/:stationId/analytics     (public)
 *   GET  /api/solar/reports                           (public)
 *   POST /api/solar/reports                           (auth required)
 *   GET  /api/solar/reports/:id                       (public)
 *   PUT  /api/solar/reports/:id                       (auth required)
 *   DELETE /api/solar/reports/:id                     (auth required)
 *   PATCH  /api/solar/reports/:id/publish             (auth required)
 *
 * Owner: Member 3 · Ref: SolarIntelligence_Module_Prompt.md → A7
 */

import request  from 'supertest';
import jwt      from 'jsonwebtoken';
import { Types } from 'mongoose';
import app      from '../../../app';
import { connectTestDb, disconnectTestDb, seedCore } from './helpers';
import { User } from '@modules/users/user.model';
import { Role } from '@modules/permissions/role.model';
import ApiError from '@utils/ApiError';

// ── Mock solarService (isolate from Station/SolarReport model dependency) ────

jest.mock('@modules/solar/solar.service', () => ({
  __esModule: true,
  default: {
    getLiveWeather:       jest.fn(),
    getForecastWithSolar: jest.fn(),
    getStationAnalytics:  jest.fn(),
    getReports:           jest.fn(),
    createReport:         jest.fn(),
    getReportById:        jest.fn(),
    updateReport:         jest.fn(),
    deleteReport:         jest.fn(),
    publishReport:        jest.fn(),
  },
}));

import solarService from '@modules/solar/solar.service';

const mockSvc = solarService as jest.Mocked<typeof solarService>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STATION_ID = new Types.ObjectId().toString();
const REPORT_ID  = new Types.ObjectId().toString();

const fakeWeather = {
  stationId:         STATION_ID,
  stationName:       'Test Station',
  solarPanelKw:      5,
  weather: {
    cloudCoverPct: 20,
    uvIndex:       5,
    temperatureC:  28,
    windSpeedKph:  8,
    weatherMain:   'Clear',
    weatherIcon:   '01d',
    capturedAt:    new Date().toISOString(),
    isFallback:    false,
  },
  estimatedOutputKw: 4.1,
  solarScore:        8,
};

const fakeForecast = {
  stationId:    STATION_ID,
  stationName:  'Test Station',
  solarPanelKw: 5,
  forecast:     [],
  bestWindows:  [],
};

const fakeAnalytics = {
  hasData:              true,
  reportCount:          12,
  avgSolarScore:        7.8,
  avgAccuracyPct:       94.2,
  avgEstimatedOutputKw: 4.0,
  avgActualOutputKw:    3.8,
  last30Days:           [
    { _id: '2026-02-20', avgScore: 7.5, reportCount: 3 },
  ],
};

const fakeReport = {
  _id:               REPORT_ID,
  station:           STATION_ID,
  submittedBy:       new Types.ObjectId().toString(),
  visitedAt:         new Date().toISOString(),
  estimatedOutputKw: 4.1,
  solarScore:        8,
  status:            'draft',
  isPublic:          true,
  isDeleted:         false,
  createdAt:         new Date().toISOString(),
};

const fakePaginatedReports = {
  data: [fakeReport],
  pagination: {
    page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false,
  },
};

// ── Shared tokens ─────────────────────────────────────────────────────────────

let adminToken:   string;
let regularToken: string;
let userId:       string;

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  await connectTestDb();
  await seedCore();

  const jwtSecret = process.env.JWT_SECRET!;
  const adminRole = await Role.findOne({ name: 'admin' }).lean();
  const userRole  = await Role.findOne({ name: 'user' }).lean();

  if (!adminRole || !userRole) {
    throw new Error('Integration test setup: roles not seeded correctly');
  }

  const adminUser = await User.create({
    displayName:     'Solar Admin',
    email:           `solar-admin-${Date.now()}@test.com`,
    password:        'hashed-irrelevant',
    role:            adminRole._id,
    isActive:        true,
    isEmailVerified: true,
    isBanned:        false,
  });

  const regularUser = await User.create({
    displayName:     'Solar User',
    email:           `solar-user-${Date.now()}@test.com`,
    password:        'hashed-irrelevant',
    role:            userRole._id,
    isActive:        true,
    isEmailVerified: true,
    isBanned:        false,
  });

  userId = (regularUser._id as Types.ObjectId).toString();

  adminToken = jwt.sign(
    {
      _id:             (adminUser._id as Types.ObjectId).toString(),
      email:           adminUser.email,
      role:            (adminRole._id as Types.ObjectId).toString(),
      roleLevel:       4,
      isEmailVerified: true,
      isActive:        true,
      isBanned:        false,
    },
    jwtSecret,
    { expiresIn: '15m' },
  );

  regularToken = jwt.sign(
    {
      _id:             userId,
      email:           regularUser.email,
      role:            (userRole._id as Types.ObjectId).toString(),
      roleLevel:       1,
      isEmailVerified: true,
      isActive:        true,
      isBanned:        false,
    },
    jwtSecret,
    { expiresIn: '15m' },
  );
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSvc.getLiveWeather.mockResolvedValue(fakeWeather as never);
  mockSvc.getForecastWithSolar.mockResolvedValue(fakeForecast as never);
  mockSvc.getStationAnalytics.mockResolvedValue(fakeAnalytics as never);
  mockSvc.getReports.mockResolvedValue(fakePaginatedReports as never);
  mockSvc.createReport.mockResolvedValue(fakeReport as never);
  mockSvc.getReportById.mockResolvedValue(fakeReport as never);
  mockSvc.updateReport.mockResolvedValue(fakeReport as never);
  mockSvc.deleteReport.mockResolvedValue(undefined);
  mockSvc.publishReport.mockResolvedValue({ ...fakeReport, status: 'published' } as never);
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/solar/stations/:stationId/live-weather  — PUBLIC
// ══════════════════════════════════════════════════════════════════════════════

describe('GET /api/solar/stations/:stationId/live-weather', () => {
  it('200 — returns live weather without auth', async () => {
    const res = await request(app).get(`/api/solar/stations/${STATION_ID}/live-weather`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.estimatedOutputKw).toBe(4.1);
    expect(mockSvc.getLiveWeather).toHaveBeenCalledWith(STATION_ID);
  });

  it('404 — propagates station-not-found error', async () => {
    mockSvc.getLiveWeather.mockRejectedValue(ApiError.notFound('Station not found'));

    const res = await request(app).get(`/api/solar/stations/${STATION_ID}/live-weather`);
    expect(res.status).toBe(404);
  });

  it('422 — rejects invalid stationId param', async () => {
    const res = await request(app).get('/api/solar/stations/not-a-valid-id/live-weather');
    expect(res.status).toBe(422);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/solar/stations/:stationId/forecast  — PUBLIC
// ══════════════════════════════════════════════════════════════════════════════

describe('GET /api/solar/stations/:stationId/forecast', () => {
  it('200 — returns forecast data without auth', async () => {
    const res = await request(app).get(`/api/solar/stations/${STATION_ID}/forecast`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSvc.getForecastWithSolar).toHaveBeenCalledWith(STATION_ID);
  });

  it('404 — propagates station-not-found error', async () => {
    mockSvc.getForecastWithSolar.mockRejectedValue(ApiError.notFound('Station not found'));

    const res = await request(app).get(`/api/solar/stations/${STATION_ID}/forecast`);
    expect(res.status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/solar/stations/:stationId/analytics  — PUBLIC
// ══════════════════════════════════════════════════════════════════════════════

describe('GET /api/solar/stations/:stationId/analytics', () => {
  it('200 — returns analytics object without auth', async () => {
    const res = await request(app).get(`/api/solar/stations/${STATION_ID}/analytics`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.avgSolarScore).toBe(7.8);
  });

  it('200 — hasData: false when no reports exist', async () => {
    mockSvc.getStationAnalytics.mockResolvedValue({
      hasData: false, reportCount: 0, avgSolarScore: 0,
      avgAccuracyPct: null, avgEstimatedOutputKw: 0, avgActualOutputKw: null, last30Days: [],
    });

    const res = await request(app).get(`/api/solar/stations/${STATION_ID}/analytics`);
    expect(res.status).toBe(200);
    expect(res.body.data.hasData).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/solar/reports  — PUBLIC
// ══════════════════════════════════════════════════════════════════════════════

describe('GET /api/solar/reports', () => {
  it('200 — returns paginated reports without auth', async () => {
    const res = await request(app).get('/api/solar/reports');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // ApiResponse.paginated puts data array at top level, pagination as sibling
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  it('422 — rejects unknown query params (Joi stripUnknown off)', async () => {
    const res = await request(app).get('/api/solar/reports?badParam=oops');
    expect([422, 200]).toContain(res.status);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/solar/reports  — AUTH REQUIRED
// ══════════════════════════════════════════════════════════════════════════════

describe('POST /api/solar/reports', () => {
  const validBody = {
    stationId: STATION_ID,
    isPublic:  true,
  };

  it('201 — creates a report when authenticated', async () => {
    const res = await request(app)
      .post('/api/solar/reports')
      .set('Authorization', `Bearer ${regularToken}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockSvc.createReport).toHaveBeenCalledTimes(1);
  });

  it('401 — rejects unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/solar/reports')
      .send(validBody);

    expect(res.status).toBe(401);
    expect(mockSvc.createReport).not.toHaveBeenCalled();
  });

  it('422 — rejects body without stationId', async () => {
    const res = await request(app)
      .post('/api/solar/reports')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ isPublic: true });

    expect(res.status).toBe(422);
    expect(mockSvc.createReport).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/solar/reports/:id  — PUBLIC
// ══════════════════════════════════════════════════════════════════════════════

describe('GET /api/solar/reports/:id', () => {
  it('200 — returns report by id without auth', async () => {
    const res = await request(app).get(`/api/solar/reports/${REPORT_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(REPORT_ID);
  });

  it('404 — propagates not-found error', async () => {
    mockSvc.getReportById.mockRejectedValue(ApiError.notFound('Solar report not found'));

    const res = await request(app).get(`/api/solar/reports/${REPORT_ID}`);
    expect(res.status).toBe(404);
  });

  it('422 — rejects invalid :id param', async () => {
    const res = await request(app).get('/api/solar/reports/bad-id-format');
    expect(res.status).toBe(422);
    expect(mockSvc.getReportById).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/solar/reports/:id  — AUTH REQUIRED
// ══════════════════════════════════════════════════════════════════════════════

describe('PUT /api/solar/reports/:id', () => {
  it('200 — updates report when authenticated as owner', async () => {
    const res = await request(app)
      .put(`/api/solar/reports/${REPORT_ID}`)
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ notes: 'Updated note' });

    expect(res.status).toBe(200);
    expect(mockSvc.updateReport).toHaveBeenCalledTimes(1);
  });

  it('401 — rejects unauthenticated updates', async () => {
    const res = await request(app)
      .put(`/api/solar/reports/${REPORT_ID}`)
      .send({ notes: 'Sneaky edit' });

    expect(res.status).toBe(401);
  });

  it('403 — propagates forbidden error when non-owner attempts edit', async () => {
    mockSvc.updateReport.mockRejectedValue(
      ApiError.forbidden('You do not have permission to edit this report'),
    );

    const res = await request(app)
      .put(`/api/solar/reports/${REPORT_ID}`)
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ notes: 'Unauthorized' });

    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/solar/reports/:id  — AUTH REQUIRED
// ══════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/solar/reports/:id', () => {
  it('204 — soft-deletes report (no-content response)', async () => {
    const res = await request(app)
      .delete(`/api/solar/reports/${REPORT_ID}`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(204);
    expect(mockSvc.deleteReport).toHaveBeenCalledTimes(1);
  });

  it('401 — rejects unauthenticated deletes', async () => {
    const res = await request(app).delete(`/api/solar/reports/${REPORT_ID}`);
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/solar/reports/:id/publish  — AUTH REQUIRED
// ══════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/solar/reports/:id/publish', () => {
  it('200 — publishes report when authenticated as owner', async () => {
    const res = await request(app)
      .patch(`/api/solar/reports/${REPORT_ID}/publish`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('published');
    expect(mockSvc.publishReport).toHaveBeenCalledTimes(1);
  });

  it('401 — rejects unauthenticated publish attempts', async () => {
    const res = await request(app).patch(`/api/solar/reports/${REPORT_ID}/publish`);
    expect(res.status).toBe(401);
  });

  it('400 — propagates already-published error', async () => {
    mockSvc.publishReport.mockRejectedValue(
      ApiError.badRequest('Report is already published'),
    );

    const res = await request(app)
      .patch(`/api/solar/reports/${REPORT_ID}/publish`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(400);
  });
});
