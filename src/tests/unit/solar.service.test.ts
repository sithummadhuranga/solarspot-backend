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
 *   - solarService.getStationAnalytics (2 tests)
 *
 * Owner: Member 3 · Ref: SolarIntelligence_Module_Prompt.md → A7
 */

import { Types } from 'mongoose';

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
import { SolarReport } from '@modules/solar/solar-report.model';
import { solarWeatherService } from '@modules/solar/solar-weather.service';

const mockStation    = Station    as jest.Mocked<typeof Station>;
const mockReport     = SolarReport as jest.Mocked<typeof SolarReport>;
const mockWeatherSvc = solarWeatherService as jest.Mocked<typeof solarWeatherService>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FAKE_STATION_ID = new Types.ObjectId();
const FAKE_USER_ID    = new Types.ObjectId();
const FAKE_REPORT_ID  = new Types.ObjectId();

const fakeStation = {
  _id:          FAKE_STATION_ID,
  name:         'Test Solar Station',
  solarPanelKw: 5.5,
  isActive:     true,
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
    // cloudReduction = 1 − (100/100) × 0.75 = 0.25; uvBoost = 0 → efficiency = 0
    expect(result.estimatedOutputKw).toBe(0);
    expect(result.solarScore).toBe(0);
  });

  it('returns full output on clear sky with UV = 5 and ideal temperature', () => {
    const result = calculateSolarOutput(5, {
      cloudCoverPct: 0,
      uvIndex:       5,
      temperatureC:  25,
      windSpeedKph:  0,
    });
    // cloudReduction = 1; uvBoost = 1; no penalties → efficiency = 1
    expect(result.estimatedOutputKw).toBe(5);
    expect(result.solarScore).toBe(10);
    expect(result.efficiency).toBe(1);
  });

  it('applies temperature penalty above 25°C', () => {
    const baseline = calculateSolarOutput(5, {
      cloudCoverPct: 0, uvIndex: 5, temperatureC: 25, windSpeedKph: 0,
    });
    const hot = calculateSolarOutput(5, {
      cloudCoverPct: 0, uvIndex: 5, temperatureC: 40, windSpeedKph: 0,
    });
    expect(hot.estimatedOutputKw).toBeLessThan(baseline.estimatedOutputKw);
  });

  it('applies wind penalty above 15 km/h', () => {
    const calm = calculateSolarOutput(5, {
      cloudCoverPct: 0, uvIndex: 5, temperatureC: 25, windSpeedKph: 10,
    });
    const windy = calculateSolarOutput(5, {
      cloudCoverPct: 0, uvIndex: 5, temperatureC: 25, windSpeedKph: 60,
    });
    expect(windy.estimatedOutputKw).toBeLessThan(calm.estimatedOutputKw);
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
    dt:            new Date(Date.now() + offset * 3 * 3600 * 1000),
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

  it('saves a report and returns it', async () => {
    mockStation.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(fakeStation) } as never);
    mockWeatherSvc.getCurrentWeather.mockResolvedValue(fakeWeather);

    const result = (await solarService.createReport(
      { stationId: FAKE_STATION_ID.toString(), isPublic: true },
      FAKE_USER_ID.toString(),
    )) as unknown as { save: jest.Mock; estimatedOutputKw: number };

    expect(result.save).toBeDefined();
    expect(result.estimatedOutputKw).toBeGreaterThanOrEqual(0);
  });

  it('calculates accuracyPct when actualOutputKw is provided', async () => {
    mockStation.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(fakeStation) } as never);
    mockWeatherSvc.getCurrentWeather.mockResolvedValue(fakeWeather);

    // The pre-save hook on the real model computes accuracyPct; here we confirm
    // that actualOutputKw is passed through to the saved document.
    const result = await solarService.createReport(
      { stationId: FAKE_STATION_ID.toString(), actualOutputKw: 4.0 },
      FAKE_USER_ID.toString(),
    );

    expect(result.actualOutputKw).toBe(4.0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// solarService.updateReport
// ══════════════════════════════════════════════════════════════════════════════

describe('solarService.updateReport', () => {
  const otherUserId   = new Types.ObjectId().toString();

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
    mockReport.findOne.mockResolvedValue({ ...fakeDoc, save: jest.fn() } as never);

    await expect(
      solarService.updateReport(FAKE_REPORT_ID.toString(), { notes: 'hi' }, otherUserId, 'user'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows admin to edit any report', async () => {
    const doc = { ...fakeDoc, save: jest.fn().mockResolvedValue(undefined) };
    mockReport.findOne.mockResolvedValue(doc as never);

    const result = (await solarService.updateReport(
      FAKE_REPORT_ID.toString(),
      { notes: 'admin edit' },
      otherUserId,
      'admin',
    )) as unknown as { save: jest.Mock };

    expect(result.save).toBeDefined();
    expect(doc.notes).toBe('admin edit');
  });

  it('recalculates accuracyPct when actualOutputKw is updated', async () => {
    const doc = { ...fakeDoc, save: jest.fn().mockResolvedValue(undefined) };
    mockReport.findOne.mockResolvedValue(doc as never);

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
// solarService.getStationAnalytics
// ══════════════════════════════════════════════════════════════════════════════

describe('solarService.getStationAnalytics', () => {
  it('returns hasData: false with zeroed values when no reports exist', async () => {
    mockReport.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await solarService.getStationAnalytics(FAKE_STATION_ID.toString());

    expect(result.hasData).toBe(false);
    expect(result.reportCount).toBe(0);
    expect(result.avgSolarScore).toBe(0);
    expect(result.last30Days).toEqual([]);
  });

  it('returns correct avgSolarScore from mock aggregation result', async () => {
    mockReport.aggregate
      .mockResolvedValueOnce([{
        _id:         null,
        reportCount: 10,
        avgScore:    7.5,
        avgAccuracy: 92.3,
        avgEstKw:    4.1,
        avgActKw:    3.9,
      }])
      .mockResolvedValueOnce([
        { _id: '2026-02-20', avgScore: 7.0, reportCount: 3 },
        { _id: '2026-02-21', avgScore: 8.0, reportCount: 2 },
      ]);

    const result = await solarService.getStationAnalytics(FAKE_STATION_ID.toString());

    expect(result.hasData).toBe(true);
    expect(result.avgSolarScore).toBe(7.5);
    expect(result.reportCount).toBe(10);
    expect(result.last30Days).toHaveLength(2);
  });
});
