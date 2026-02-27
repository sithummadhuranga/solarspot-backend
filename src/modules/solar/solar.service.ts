/**
 * SolarService — business logic for Solar Intelligence & Charging Analytics.
 *
 * This service is the only layer that:
 *   - reads / writes SolarReport documents
 *   - calls solarWeatherService for live weather or forecast
 *   - runs the MongoDB analytics aggregation pipeline
 *
 * Controllers are thin; all domain decisions live here.
 *
 * ACID compliance:
 *   - createReport: single document write — no transaction necessary.
 *   - deleteReport:  single document update (soft-delete) — atomic via Mongoose save.
 *   - publishReport: single document update — atomic.
 *
 * Owner: Member 3 · Ref: SolarIntelligence_Module_Prompt.md → A3
 */

import { Types }   from 'mongoose';
import { Station } from '@modules/stations/station.model';
import { SolarReport, ISolarReport } from './solar-report.model';
import {
  solarWeatherService,
  calculateSolarOutput,
  getBestChargingWindows,
  type WeatherSnapshot,
  type ForecastSlot,
  type BestWindow,
} from './solar-weather.service';
import ApiError  from '@utils/ApiError';
import logger    from '@utils/logger';

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface CreateReportDto {
  stationId:       string;
  visitedAt?:      string;           // ISO string; defaults to now
  actualOutputKw?: number | null;
  notes?:          string | null;
  isPublic?:       boolean;
}

export interface UpdateReportDto {
  actualOutputKw?: number | null;
  notes?:          string | null;
  isPublic?:       boolean;
}

export interface ReportQuery {
  stationId?:   string;
  submittedBy?: string;
  status?:      'draft' | 'published';
  isPublic?:    boolean;
  from?:        string;
  to?:          string;
  page?:        number;
  limit?:       number;
  sort?:        'newest' | 'oldest' | 'score';
}

// ── Response shapes ───────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  data:       T[];
  pagination: {
    page:       number;
    limit:      number;
    total:      number;
    totalPages: number;
    hasNext:    boolean;
    hasPrev:    boolean;
  };
}

export interface LiveWeatherResponse {
  stationId:         string;
  stationName:       string;
  solarPanelKw:      number;
  weather:           WeatherSnapshot;
  estimatedOutputKw: number;
  solarScore:        number;
}

export interface ForecastWithSolarResponse {
  stationId:    string;
  stationName:  string;
  solarPanelKw: number;
  forecast:     ForecastSlot[];
  bestWindows:  BestWindow[];
}

export interface DayAggregate {
  _id:         string;   // YYYY-MM-DD
  avgScore:    number;
  reportCount: number;
}

export interface StationAnalytics {
  hasData:              boolean;
  reportCount:          number;
  avgSolarScore:        number;
  avgAccuracyPct:       number | null;
  avgEstimatedOutputKw: number;
  avgActualOutputKw:    number | null;
  last30Days:           DayAggregate[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extracts [lng, lat] from a station document. Throws 400 if missing. */
function extractCoords(station: { location?: { coordinates?: number[] } | null }): [number, number] {
  const coords = station.location?.coordinates;
  if (!coords || coords.length < 2) {
    throw ApiError.badRequest('Station does not have coordinates — weather data unavailable');
  }
  return [coords[0], coords[1]]; // [lng, lat] → we need lat, lng
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * POST /api/solar/reports
 *
 * 1. Validates station exists and is active.
 * 2. Fetches live weather for the station's coordinate.
 * 3. Calculates estimated solar output.
 * 4. Saves the report (pre-save hook computes accuracyPct if actualOutputKw given).
 */
export async function createReport(dto: CreateReportDto, userId: string): Promise<ISolarReport> {
  const station = await Station.findById(dto.stationId).lean();
  if (!station || !station.isActive) {
    throw ApiError.notFound('Station not found or is no longer active');
  }

  const [lng, lat] = extractCoords(station);

  // Fetch weather — degrades gracefully if OWM is down (503 propagated)
  let weatherSnapshot: WeatherSnapshot;
  try {
    weatherSnapshot = await solarWeatherService.getCurrentWeather(lat, lng);
  } catch (err) {
    // If OWM is down, we cannot compute estimatedOutputKw — block submission
    logger.warn('createReport: OWM unavailable', { err, stationId: dto.stationId });
    throw err;
  }

  const calc = calculateSolarOutput(station.solarPanelKw, weatherSnapshot);

  const report = new SolarReport({
    station:    new Types.ObjectId(dto.stationId),
    submittedBy: new Types.ObjectId(userId),
    visitedAt:  dto.visitedAt ? new Date(dto.visitedAt) : new Date(),
    weatherSnapshot: {
      cloudCoverPct:  weatherSnapshot.cloudCoverPct,
      uvIndex:        weatherSnapshot.uvIndex,
      temperatureC:   weatherSnapshot.temperatureC,
      windSpeedKph:   weatherSnapshot.windSpeedKph,
      weatherMain:    weatherSnapshot.weatherMain,
      weatherIcon:    weatherSnapshot.weatherIcon,
      capturedAt:     weatherSnapshot.capturedAt,
      isFallback:     weatherSnapshot.isFallback ?? false,
    },
    estimatedOutputKw: calc.estimatedOutputKw,
    solarScore:        calc.solarScore,
    actualOutputKw:    dto.actualOutputKw ?? null,
    notes:             dto.notes ?? null,
    isPublic:          dto.isPublic ?? true,
    status:            'draft',
  });

  await report.save();
  return report;
}

/**
 * GET /api/solar/reports
 *
 * Supports filtering by stationId, submittedBy, status, isPublic, date range.
 * Default page: 1, limit: 10, sort: newest.
 */
export async function getReports(query: ReportQuery): Promise<PaginatedResult<ISolarReport>> {
  const page  = Math.max(1, query.page  ?? 1);
  const limit = Math.min(50, Math.max(1, query.limit ?? 10));
  const skip  = (page - 1) * limit;

  const filter: Record<string, unknown> = { isDeleted: false };

  if (query.stationId)   filter['station']     = new Types.ObjectId(query.stationId);
  if (query.submittedBy) filter['submittedBy']  = new Types.ObjectId(query.submittedBy);
  if (query.status)      filter['status']       = query.status;
  if (query.isPublic !== undefined) filter['isPublic'] = query.isPublic;

  if (query.from || query.to) {
    const range: Record<string, Date> = {};
    if (query.from) range['$gte'] = new Date(query.from);
    if (query.to)   range['$lte'] = new Date(query.to);
    filter['visitedAt'] = range;
  }

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    newest: { visitedAt: -1 },
    oldest: { visitedAt:  1 },
    score:  { solarScore: -1 },
  };
  const sort = sortMap[query.sort ?? 'newest'] ?? sortMap['newest'];

  const [data, total] = await Promise.all([
    SolarReport.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('station',     'name solarPanelKw')
      .populate('submittedBy', 'displayName')
      .lean(),
    SolarReport.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);
  return {
    data: data as ISolarReport[],
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * GET /api/solar/reports/:id
 */
export async function getReportById(id: string): Promise<ISolarReport> {
  if (!Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest('Invalid report id');
  }

  const report = await SolarReport.findOne({ _id: id, isDeleted: false })
    .populate('station',     'name solarPanelKw location')
    .populate('submittedBy', 'displayName');

  if (!report) {
    throw ApiError.notFound('Solar report not found');
  }
  return report;
}

/**
 * PUT /api/solar/reports/:id
 *
 * Only the report owner may edit; admin can edit any.
 * If actualOutputKw is updated the pre-save hook recalculates accuracyPct.
 */
export async function updateReport(
  id: string,
  dto: UpdateReportDto,
  userId: string,
  userRole: string,
): Promise<ISolarReport> {
  const report = await SolarReport.findOne({ _id: id, isDeleted: false });
  if (!report) throw ApiError.notFound('Solar report not found');

  const isAdmin = ['admin', 'moderator'].includes(userRole);
  const isOwner = report.submittedBy.toString() === userId;
  if (!isOwner && !isAdmin) {
    throw ApiError.forbidden('You do not have permission to edit this report');
  }

  if (dto.actualOutputKw !== undefined) report.actualOutputKw = dto.actualOutputKw ?? null;
  if (dto.notes          !== undefined) report.notes          = dto.notes ?? null;
  if (dto.isPublic       !== undefined) report.isPublic       = dto.isPublic;

  await report.save();  // pre-save hook recalculates accuracyPct
  return report;
}

/**
 * DELETE /api/solar/reports/:id
 *
 * Soft-delete — sets isDeleted + deletedAt so analytics remain stable.
 * Owner or admin only.
 */
export async function deleteReport(id: string, userId: string, userRole: string): Promise<void> {
  const report = await SolarReport.findOne({ _id: id, isDeleted: false });
  if (!report) throw ApiError.notFound('Solar report not found');

  const isAdmin = ['admin', 'moderator'].includes(userRole);
  const isOwner = report.submittedBy.toString() === userId;
  if (!isOwner && !isAdmin) {
    throw ApiError.forbidden('You do not have permission to delete this report');
  }

  report.isDeleted = true;
  report.deletedAt = new Date();
  report.isActive  = false;
  await report.save();
}

/**
 * PATCH /api/solar/reports/:id/publish
 *
 * Transitions status: 'draft' → 'published'.
 * Already-published reports return 400 to prevent duplicate publications.
 * Owner or admin only.
 */
export async function publishReport(id: string, userId: string, userRole: string): Promise<ISolarReport> {
  const report = await SolarReport.findOne({ _id: id, isDeleted: false });
  if (!report) throw ApiError.notFound('Solar report not found');

  if (report.status === 'published') {
    throw ApiError.badRequest('Report is already published');
  }

  const isAdmin = ['admin', 'moderator'].includes(userRole);
  const isOwner = report.submittedBy.toString() === userId;
  if (!isOwner && !isAdmin) {
    throw ApiError.forbidden('You do not have permission to publish this report');
  }

  report.status = 'published';
  await report.save();
  return report;
}

/**
 * GET /api/solar/stations/:stationId/analytics
 *
 * Aggregation pipeline — the SHOWCASE function.
 *
 * Returns:
 *   hasData            — false when no published reports exist for this station
 *   reportCount        — total published + active reports
 *   avgSolarScore      — mean solarScore across reports
 *   avgAccuracyPct     — mean accuracyPct (null-safe — skips docs without a reading)
 *   avgEstimatedOutputKw — mean estimatedOutputKw
 *   avgActualOutputKw  — mean actualOutputKw across docs that have one
 *   last30Days         — daily roll-up for sparkline chart
 */
export async function getStationAnalytics(stationId: string): Promise<StationAnalytics> {
  if (!Types.ObjectId.isValid(stationId)) {
    throw ApiError.badRequest('Invalid station id');
  }

  const stationOid = new Types.ObjectId(stationId);

  const [summary, last30Days] = await Promise.all([
    // ── Summary aggregation ────────────────────────────────────────────────
    SolarReport.aggregate<{
      _id:         null;
      reportCount: number;
      avgScore:    number;
      avgAccuracy: number | null;
      avgEstKw:    number;
      avgActKw:    number | null;
    }>([
      {
        $match: {
          station:   stationOid,
          status:    'published',
          isPublic:  true,
          isDeleted: false,
        },
      },
      {
        $group: {
          _id:         null,
          reportCount: { $sum: 1 },
          avgScore:    { $avg: '$solarScore' },
          avgAccuracy: { $avg: '$accuracyPct' },          // $avg skips nulls natively
          avgEstKw:    { $avg: '$estimatedOutputKw' },
          avgActKw:    { $avg: '$actualOutputKw' },       // $avg skips nulls natively
        },
      },
    ]),

    // ── Last 30 days daily roll-up ─────────────────────────────────────────
    SolarReport.aggregate<DayAggregate>([
      {
        $match: {
          station:   stationOid,
          status:    'published',
          isPublic:  true,
          isDeleted: false,
          visitedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id:         { $dateToString: { format: '%Y-%m-%d', date: '$visitedAt' } },
          avgScore:    { $avg: '$solarScore' },
          reportCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  if (!summary.length) {
    return {
      hasData:              false,
      reportCount:          0,
      avgSolarScore:        0,
      avgAccuracyPct:       null,
      avgEstimatedOutputKw: 0,
      avgActualOutputKw:    null,
      last30Days:           [],
    };
  }

  const s = summary[0];
  return {
    hasData:              true,
    reportCount:          s.reportCount,
    avgSolarScore:        Math.round((s.avgScore ?? 0) * 100) / 100,
    avgAccuracyPct:       s.avgAccuracy !== null ? Math.round((s.avgAccuracy ?? 0) * 100) / 100 : null,
    avgEstimatedOutputKw: Math.round((s.avgEstKw ?? 0) * 100) / 100,
    avgActualOutputKw:    s.avgActKw !== null    ? Math.round((s.avgActKw ?? 0) * 100) / 100 : null,
    last30Days:           last30Days.map((d) => ({
      _id:         d._id,
      avgScore:    Math.round((d.avgScore ?? 0) * 100) / 100,
      reportCount: d.reportCount,
    })),
  };
}

/**
 * GET /api/solar/stations/:stationId/live-weather
 *
 * Returns the station's live weather annotated with solar output prediction.
 */
export async function getLiveWeather(stationId: string): Promise<LiveWeatherResponse> {
  const station = await Station.findById(stationId).lean();
  if (!station || !station.isActive) {
    throw ApiError.notFound('Station not found or is no longer active');
  }

  const [lng, lat] = extractCoords(station);
  const weather    = await solarWeatherService.getCurrentWeather(lat, lng);
  const calc       = calculateSolarOutput(station.solarPanelKw, weather);

  return {
    stationId:         stationId,
    stationName:       station.name,
    solarPanelKw:      station.solarPanelKw,
    weather,
    estimatedOutputKw: calc.estimatedOutputKw,
    solarScore:        calc.solarScore,
  };
}

/**
 * GET /api/solar/stations/:stationId/forecast
 *
 * Returns the 5-day / 3-hourly forecast with solar annotations + top 3 windows.
 */
export async function getForecastWithSolar(stationId: string): Promise<ForecastWithSolarResponse> {
  const station = await Station.findById(stationId).lean();
  if (!station || !station.isActive) {
    throw ApiError.notFound('Station not found or is no longer active');
  }

  const [lng, lat] = extractCoords(station);
  const rawSlots   = await solarWeatherService.getForecast(lat, lng);

  // Annotate each slot with solar calculation
  const annotated: ForecastSlot[] = rawSlots.map((slot) => {
    const calc = calculateSolarOutput(station.solarPanelKw, slot);
    return { ...slot, estimatedOutputKw: calc.estimatedOutputKw, solarScore: calc.solarScore };
  });

  const bestWindows = getBestChargingWindows(annotated, station.solarPanelKw);

  return {
    stationId,
    stationName:  station.name,
    solarPanelKw: station.solarPanelKw,
    forecast:     annotated,
    bestWindows,
  };
}

// ── Default export (service object) ──────────────────────────────────────────

const solarService = {
  createReport,
  getReports,
  getReportById,
  updateReport,
  deleteReport,
  publishReport,
  getStationAnalytics,
  getLiveWeather,
  getForecastWithSolar,
};

export default solarService;
