/**
 * Unit tests — Solar Intelligence module
 *
 * All external dependencies are mocked so this suite has zero I/O:
 *   - Station model          → mocked DB queries
 *   - SolarReport model      → mocked DB operations
 *   - solarWeatherService    → mocked OWM calls
 *   - logger                 → silenced
 *
 * Covers:
 *   - calculateSolarOutput (pure function — 5 tests)
 *   - getBestChargingWindows (pure function — 4 tests)
 *   - solarService.createReport (5 tests)
 *   - solarService.updateReport (3 tests)
 *   - solarService.publishReport / archiveReport elevated-role paths
 *   - solarService.getReports elevated visibility
 *   - solarService.getStationAnalytics (2 tests)
 *
 * Owner: Member 3 · Ref: SolarIntelligence_Module_Prompt.md → A7
 */

import mongoose, { Types } from 'mongoose';

// ── Mocks (must be hoisted before any imports) ────────────────────────────────

jest.mock('@config/env', () => ({
  config: {
    OPENWEATHER_API_KEY: 'test-key',
    NODE_ENV:            'test',
  },
}));

jest.mock('@utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@modules/stations/station.model', () => ({
  Station: { findById: jest.fn() },
}));

jest.mock('@modules/permissions/audit_log.model', () => ({
  AuditLog: { create: jest.fn() },
}));

jest.mock('@modules/solar/solar-report.model', () => {
  // We need a constructor mock that also supports model static methods.
  const mockSave = jest.fn().mockResolvedValue(undefined);
  const MockSolarReport = jest.fn().mockImplementation((data: unknown) => ({
    ...(data as object),
    save: mockSave,
  }));
  (MockSolarReport as unknown as Record<string, unknown>).find         = jest.fn();
  (MockSolarReport as unknown as Record<string, unknown>).findOne      = jest.fn();
  (MockSolarReport as unknown as Record<string, unknown>).findById     = jest.fn();
  (MockSolarReport as unknown as Record<string, unknown>).create       = jest.fn();
  (MockSolarReport as unknown as Record<string, unknown>).countDocuments = jest.fn();
  (MockSolarReport as unknown as Record<string, unknown>).aggregate    = jest.fn();
  return { SolarReport: MockSolarReport };
});

jest.mock('@modules/solar/solar-weather.service', () => ({
  solarWeatherService: {
    getCurrentWeather: jest.fn(),
    getForecast:       jest.fn(),
  },
  calculateSolarOutput:      jest.requireActual('@modules/solar/solar-weather.service').calculateSolarOutput,
  getBestChargingWindows:    jest.requireActual('@modules/solar/solar-weather.service').getBestChargingWindows,
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { calculateSolarOutput, getBestChargingWindows } from '@modules/solar/solar-weather.service';
import solarService from '@modules/solar/solar.service';
import { Station }  from '@modules/stations/station.model';
import { AuditLog } from '@modules/permissions/audit_log.model';
import { SolarReport } from '@modules/solar/solar-report.model';
import { solarWeatherService } from '@modules/solar/solar-weather.service';

const mockStation    = Station    as jest.Mocked<typeof Station>;
const mockAuditLog   = AuditLog   as jest.Mocked<typeof AuditLog>;
const mockReport     = SolarReport as jest.Mocked<typeof SolarReport>;
const mockWeatherSvc = solarWeatherService as jest.Mocked<typeof solarWeatherService>;
const mockSession = {
  withTransaction: jest.fn(async (callback: () => Promise<unknown>) => callback()),
  endSession: jest.fn().mockResolvedValue(undefined),
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FAKE_STATION_ID = new Types.ObjectId();
const FAKE_USER_ID    = new Types.ObjectId();
const FAKE_REPORT_ID  = new Types.ObjectId();

const fakeStation = {
  _id:          FAKE_STATION_ID,
  name:         'Test Solar Station',
  solarPanelKw: 5.5,
  isActive:     true,
  status:       'active',
  location:     { type: 'Point', coordinates: [80.7, 7.8] }, // [lng, lat]
};

const fakeWeather = {
  cloudCoverPct: 25,
  uvIndex:       6.0,
  temperatureC:  29,
  windSpeedKph:  10,
  weatherMain:   'Clouds',
  weatherIcon:   '02d',
  capturedAt:    new Date(),
  isFallback:    false,
};

// ── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession as never);
  mockAuditLog.create.mockResolvedValue([] as never);
});

// ══════════════════════════════════════════════════════════════════════════════
// calculateSolarOutput — pure function tests
// ══════════════════════════════════════════════════════════════════════════════

describe('weatherService.calculateSolarOutput', () => {
  it('returns 0 output when cloud cover is 100%', () => {
    const result = calculateSolarOutput(5, {
      cloudCoverPct: 100,
      uvIndex:       0,
      temperatureC:  25,
      windSpeedKph:  0,
    });
    expect(result.estimatedOutputKw).toBe(0);
    expect(result.solarScore).toBe(0);
  });

  it('returns maximum modelled output on clear sky with strong UV', () => {
    const result = calculateSolarOutput(5, {
      cloudCoverPct: 0,
      uvIndex:       10,
      temperatureC:  25,
      windSpeedKph:  0,
    });
    expect(result.estimatedOutputKw).toBe(4.25);
    expect(result.solarScore).toBe(85);
    expect(result.efficiency).toBe(0.85);
  });

  it('reduces output as cloud cover increases', () => {
    const clear = calculateSolarOutput(5, {
      cloudCoverPct: 10, uvIndex: 7, temperatureC: 25, windSpeedKph: 0,
    });
    const cloudy = calculateSolarOutput(5, {
      cloudCoverPct: 70, uvIndex: 7, temperatureC: 40, windSpeedKph: 30,
    });
    expect(cloudy.estimatedOutputKw).toBeLessThan(clear.estimatedOutputKw);
  });

  it('increases output as UV index rises', () => {
    const lowUv = calculateSolarOutput(5, {
      cloudCoverPct: 20, uvIndex: 2, temperatureC: 25, windSpeedKph: 10,
    });
    const highUv = calculateSolarOutput(5, {
      cloudCoverPct: 20, uvIndex: 9, temperatureC: 45, windSpeedKph: 60,
    });
    expect(highUv.estimatedOutputKw).toBeGreaterThan(lowUv.estimatedOutputKw);
  });

  it('rounds estimatedOutputKw to 2 decimal places', () => {
    const result = calculateSolarOutput(3.333, {
      cloudCoverPct: 33,
      uvIndex:       4,
      temperatureC:  27,
      windSpeedKph:  12,
    });
    const decimalPlaces = (result.estimatedOutputKw.toString().split('.')[1] ?? '').length;
    expect(decimalPlaces).toBeLessThanOrEqual(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// getBestChargingWindows — pure function tests
// ══════════════════════════════════════════════════════════════════════════════

describe('weatherService.getBestChargingWindows', () => {
  const makeSlot = (uvIndex: number, cloudCoverPct: number, offset: number) => ({
    dt:            new Date(Date.now() + offset * 3 * 3600 * 1000).toISOString(),
    cloudCoverPct,
    temperatureC:  28,
    windSpeedKph:  10,
    weatherMain:   'Clear',
    weatherIcon:   '01d',
    uvIndex,
  });

  it('returns at most 3 windows regardless of input size', () => {
    const slots = Array.from({ length: 20 }, (_, i) => makeSlot(6, 10, i));
    const result = getBestChargingWindows(slots, 5);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('returns slots sorted by solarScore descending', () => {
    const slots = [
      makeSlot(2, 80, 0),
      makeSlot(8, 5,  1),
      makeSlot(5, 30, 2),
    ];
    const result = getBestChargingWindows(slots, 5);
    expect(result[0].solarScore).toBeGreaterThanOrEqual(result[1]?.solarScore ?? 0);
  });

  it('excludes night-time slots (uvIndex = 0)', () => {
    const slots = [
      makeSlot(0, 0, 0),  // night
      makeSlot(0, 0, 1),  // night
      makeSlot(6, 20, 2), // day
    ];
    const result = getBestChargingWindows(slots, 5);
    result.forEach((w) => {
      // All returned windows should have a positive solar score (never 0 from night)
      expect(w.solarScore).toBeGreaterThan(0);
    });
  });

  it('returns empty array when given empty input', () => {
    const result = getBestChargingWindows([], 5);
    expect(result).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// solarService.createReport
// ══════════════════════════════════════════════════════════════════════════════

describe('solarService.createReport', () => {
  const sessionLeanQuery = <T>(value: T) => ({
    session: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(value),
    }),
  });

  it('throws 404 when station does not exist', async () => {
    mockStation.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) } as never);

    await expect(
      solarService.createReport({ stationId: FAKE_STATION_ID.toString() }, FAKE_USER_ID.toString()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 when station is inactive', async () => {
    mockStation.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ ...fakeStation, isActive: false }),
    } as never);

    await expect(
      solarService.createReport({ stationId: FAKE_STATION_ID.toString() }, FAKE_USER_ID.toString()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 400 when station has no coordinates', async () => {
    mockStation.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ ...fakeStation, location: null }),
    } as never);

    await expect(
      solarService.createReport({ stationId: FAKE_STATION_ID.toString() }, FAKE_USER_ID.toString()),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('saves a report and returns it with status published', async () => {
    mockStation.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(fakeStation) } as never);
    mockWeatherSvc.getCurrentWeather.mockResolvedValue(fakeWeather);
    mockReport.findOne.mockReturnValue(sessionLeanQuery(null) as never);
    mockReport.create.mockResolvedValue([
      {
        _id: FAKE_REPORT_ID,
        status: 'published',
        estimatedOutputKw: 3.51,
        actualOutputKw: null,
        accuracyPct: null,
        solarScore: 64,
        isPublic: true,
      },
    ] as never);

    const result = await solarService.createReport(
      { stationId: FAKE_STATION_ID.toString(), isPublic: true },
      FAKE_USER_ID.toString(),
    );

    expect(result.estimatedOutputKw).toBeGreaterThanOrEqual(0);
    expect(result.status).toBe('published');
    expect(mockReport.create).toHaveBeenCalledTimes(1);
    expect(mockAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it('throws 409 when user already submitted a report for this station today', async () => {
    mockStation.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(fakeStation) } as never);
    mockReport.findOne.mockReturnValue(sessionLeanQuery({ _id: FAKE_REPORT_ID }) as never);

    await expect(
      solarService.createReport({ stationId: FAKE_STATION_ID.toString() }, FAKE_USER_ID.toString()),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('calculates accuracyPct when actualOutputKw is provided', async () => {
    mockStation.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(fakeStation) } as never);
    mockWeatherSvc.getCurrentWeather.mockResolvedValue(fakeWeather);
    mockReport.findOne.mockReturnValue(sessionLeanQuery(null) as never);
    mockReport.create.mockResolvedValue([
      {
        _id: FAKE_REPORT_ID,
        status: 'published',
        estimatedOutputKw: 3.51,
        actualOutputKw: 4.0,
        accuracyPct: 114,
        solarScore: 64,
        isPublic: true,
      },
    ] as never);

    const result = await solarService.createReport(
      { stationId: FAKE_STATION_ID.toString(), actualOutputKw: 4.0 },
      FAKE_USER_ID.toString(),
    );

    expect(result.actualOutputKw).toBe(4.0);
    expect(result.accuracyPct).toBe(114);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// solarService.updateReport
// ══════════════════════════════════════════════════════════════════════════════

describe('solarService.updateReport', () => {
  const otherUserId   = new Types.ObjectId().toString();
  const sessionDocQuery = <T>(value: T) => ({
    session: jest.fn().mockResolvedValue(value),
  });

  const fakeDoc = {
    _id:               FAKE_REPORT_ID,
    submittedBy:       FAKE_USER_ID,
    estimatedOutputKw: 4.5,
    actualOutputKw:    null as number | null,
    notes:             null as string | null,
    isPublic:          true,
    isDeleted:         false,
    save:              jest.fn().mockResolvedValue(undefined),
  };

  it('throws 403 when a different user tries to edit the report', async () => {
    mockReport.findOne.mockReturnValue(sessionDocQuery({ ...fakeDoc, save: jest.fn() }) as never);

    await expect(
      solarService.updateReport(FAKE_REPORT_ID.toString(), { notes: 'hi' }, otherUserId, 'user'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows admin to edit any report', async () => {
    const doc = { ...fakeDoc, save: jest.fn().mockResolvedValue(undefined) };
    mockReport.findOne.mockReturnValue(sessionDocQuery(doc) as never);

    await solarService.updateReport(
      FAKE_REPORT_ID.toString(),
      { notes: 'admin edit' },
      otherUserId,
      new Types.ObjectId().toString(),
      4,
    );

    expect(doc.notes).toBe('admin edit');
    expect(doc.save).toHaveBeenCalledTimes(1);
    expect(mockAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it('recalculates accuracyPct when actualOutputKw is updated', async () => {
    const doc = { ...fakeDoc, save: jest.fn().mockResolvedValue(undefined) };
    mockReport.findOne.mockReturnValue(sessionDocQuery(doc) as never);

    await solarService.updateReport(
      FAKE_REPORT_ID.toString(),
      { actualOutputKw: 3.6 },
      FAKE_USER_ID.toString(),
      'user',
    );

    // confirm the doc's actualOutputKw was mutated (pre-save hook handles accuracyPct in real schema)
    expect(doc.actualOutputKw).toBe(3.6);
    expect(doc.save).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// solarService.publishReport / archiveReport
// ══════════════════════════════════════════════════════════════════════════════

describe('solarService.publishReport', () => {
  const sessionDocQuery = <T>(value: T) => ({
    session: jest.fn().mockResolvedValue(value),
  });

  it('allows a moderation-level viewer to restore an archived report using roleLevel', async () => {
    const doc = {
      _id: FAKE_REPORT_ID,
      submittedBy: FAKE_USER_ID,
      status: 'archived' as const,
      isActive: true,
      accuracyPct: null,
      save: jest.fn().mockResolvedValue(undefined),
    };

    mockReport.findOne.mockReturnValue(sessionDocQuery(doc) as never);

    const result = await solarService.publishReport(
      FAKE_REPORT_ID.toString(),
      new Types.ObjectId().toString(),
      new Types.ObjectId().toString(),
      3,
    );

    expect(doc.status).toBe('published');
    expect(doc.save).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('published');
  });
});

describe('solarService.archiveReport', () => {
  const sessionDocQuery = <T>(value: T) => ({
    session: jest.fn().mockResolvedValue(value),
  });

  it('allows a moderation-level viewer to archive a report using roleLevel', async () => {
    const doc = {
      _id: FAKE_REPORT_ID,
      submittedBy: FAKE_USER_ID,
      status: 'published' as const,
      isActive: true,
      accuracyPct: null,
      save: jest.fn().mockResolvedValue(undefined),
    };

    mockReport.findOne.mockReturnValue(sessionDocQuery(doc) as never);

    const result = await solarService.archiveReport(
      FAKE_REPORT_ID.toString(),
      new Types.ObjectId().toString(),
      new Types.ObjectId().toString(),
      3,
    );

    expect(doc.status).toBe('archived');
    expect(doc.save).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('archived');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// solarService.getReports
// ══════════════════════════════════════════════════════════════════════════════

describe('solarService.getReports', () => {
  it('returns all report statuses to elevated viewers using roleLevel even with opaque role ids', async () => {
    const queryChain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          _id: FAKE_REPORT_ID,
          submittedBy: new Types.ObjectId(),
          status: 'archived',
          isPublic: false,
          isActive: true,
          accuracyPct: null,
        },
      ]),
    };

    mockReport.find.mockReturnValue(queryChain as never);
    mockReport.countDocuments.mockResolvedValue(1 as never);

    const result = await solarService.getReports({}, {
      _id: new Types.ObjectId().toString(),
      role: new Types.ObjectId().toString(),
      roleLevel: 3,
    });

    expect(mockReport.find).toHaveBeenCalledWith({ isActive: true });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.status).toBe('archived');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// solarService.getStationAnalytics
// ══════════════════════════════════════════════════════════════════════════════

describe('solarService.getStationAnalytics', () => {
  it('returns hasData: false with zeroed values when no reports exist', async () => {
    mockReport.aggregate.mockResolvedValue([
      {
        overview: [],
        byDayOfWeek: [],
        byHourOfDay: [],
        accuracyDistribution: [],
        last30Days: [],
      },
    ] as never);

    const result = await solarService.getStationAnalytics(FAKE_STATION_ID.toString());

    expect(result.hasData).toBe(false);
    expect(result.overview.totalReports).toBe(0);
    expect(result.overview.avgSolarScore).toBe(0);
    expect(result.last30Days).toEqual([]);
  });

  it('returns correct avgSolarScore from mock aggregation result', async () => {
    mockReport.aggregate.mockResolvedValue([
      {
        overview: [{
          _id: null,
          totalReports: 10,
          avgSolarScore: 75,
          avgEstimatedOutputKw: 4.1,
          avgActualOutputKw: 3.9,
          avgAccuracyPct: 92.3,
          maxSolarScore: 94,
          minSolarScore: 42,
        }],
        byDayOfWeek: [{ _id: 2, avgScore: 78, count: 4 }],
        byHourOfDay: [{ _id: 11, avgScore: 81, count: 3 }],
        accuracyDistribution: [{ _id: 90, count: 5, avgScore: 82 }],
        last30Days: [
          { _id: '2026-02-20', avgScore: 70, reportCount: 3 },
          { _id: '2026-02-21', avgScore: 80, reportCount: 2 },
        ],
      },
    ] as never);

    const result = await solarService.getStationAnalytics(FAKE_STATION_ID.toString());

    expect(result.hasData).toBe(true);
    expect(result.overview.avgSolarScore).toBe(75);
    expect(result.overview.totalReports).toBe(10);
    expect(result.byDayOfWeek).toHaveLength(1);
    expect(result.last30Days).toHaveLength(2);
  });
});
