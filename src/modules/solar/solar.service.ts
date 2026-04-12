

import mongoose, { Types } from 'mongoose';
import { AuditLog } from '@modules/permissions/audit_log.model';
import { Station } from '@modules/stations/station.model';
import ApiError from '@utils/ApiError';
import logger from '@utils/logger';
import { SolarReport, ISolarReport } from './solar-report.model';
import {
  solarWeatherService,
  calculateSolarOutput,
  getBestChargingWindows,
  type WeatherSnapshot,
  type ForecastSlot,
  type BestWindow,
} from './solar-weather.service';

export interface CreateReportDto {
  stationId: string;
  visitedAt?: string | Date;
  actualOutputKw?: number | null;
  notes?: string | null;
  isPublic?: boolean;
}

export interface UpdateReportDto {
  actualOutputKw?: number | null;
  notes?: string | null;
  isPublic?: boolean;
}

export interface ReportQuery {
  stationId?: string;
  userId?: string;
  submittedBy?: string;
  status?: 'draft' | 'published' | 'archived';
  isPublic?: boolean;
  dateFrom?: string | Date;
  dateTo?: string | Date;
  from?: string | Date;
  to?: string | Date;
  minScore?: number;
  page?: number;
  limit?: number;
  sort?: 'newest' | 'oldest' | 'highest-score' | 'most-accurate' | 'score';
}

export interface ViewerContext {
  _id: string;
  role: string;
  roleLevel?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface LiveWeatherResponse {
  station: {
    _id: string;
    name: string;
    solarPanelKw: number;
    address: { city: string | null };
  };
  weather: WeatherSnapshot;
  solar: {
    estimatedOutputKw: number;
    solarScore: number;
    cloudFactor: number;
    uvFactor: number;
  };
  generatedAt: Date;
}

export interface ForecastWithSolarResponse {
  station: {
    _id: string;
    name: string;
    solarPanelKw: number;
  };
  forecast: ForecastSlot[];
  bestWindows: BestWindow[];
  generatedAt: Date;
}

export interface StationAnalytics {
  hasData: boolean;
  overview: {
    totalReports: number;
    avgSolarScore: number;
    avgEstimatedOutputKw: number;
    avgActualOutputKw: number;
    avgAccuracyPct: number;
    maxSolarScore: number;
    minSolarScore: number;
  };
  byDayOfWeek: Array<{ _id: number; avgScore: number; count: number }>;
  byHourOfDay: Array<{ _id: number; avgScore: number; count: number }>;
  accuracyDistribution: Array<{ _id: number | string; count: number; avgScore: number }>;
  last30Days: Array<{ _id: string; avgScore: number; reportCount: number }>;
}

function extractCoords(station: { location?: { coordinates?: number[] } | null }): [number, number] {
  const coords = station.location?.coordinates;
  if (!coords || coords.length < 2) {
    throw ApiError.badRequest('Station does not have coordinates — weather data unavailable');
  }

  return [coords[0], coords[1]];
}

function getAccuracyLabel(accuracyPct: number | null | undefined): string {
  if (accuracyPct === null || accuracyPct === undefined) return 'No Data';
  if (accuracyPct >= 110) return 'Overperforming';
  if (accuracyPct >= 90) return 'Accurate';
  if (accuracyPct >= 70) return 'Slightly Under';
  return 'Underperforming';
}

function toDate(value: string | Date | undefined): Date | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value : new Date(value);
}

function userObjectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function extractReferenceId(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === 'string') return value;

  if (value instanceof Types.ObjectId) {
    return value.toString();
  }

  if (typeof value === 'object' && '_id' in value) {
    const nestedId = (value as { _id?: unknown })._id;
    if (typeof nestedId === 'string') return nestedId;
    if (nestedId instanceof Types.ObjectId) return nestedId.toString();
  }

  if (typeof value === 'object' && typeof (value as { toString?: () => string }).toString === 'function') {
    const stringified = (value as { toString: () => string }).toString();
    return stringified && stringified !== '[object Object]' ? stringified : null;
  }

  return null;
}

function getViewerRoleLevel(viewer?: ViewerContext): number {
  return viewer?.roleLevel ?? 0;
}

function isAdminViewer(viewer?: ViewerContext): boolean {
  return getViewerRoleLevel(viewer) >= 4;
}

function canModerateSolarReports(viewer?: ViewerContext): boolean {
  return getViewerRoleLevel(viewer) >= 3;
}

function isReportOwner(
  report: Pick<ISolarReport, 'submittedBy'>,
  viewer?: Pick<ViewerContext, '_id'>,
): boolean {
  const submittedById = extractReferenceId(report.submittedBy);
  return Boolean(viewer?._id && submittedById && submittedById === viewer._id);
}

function canManageReport(report: Pick<ISolarReport, 'submittedBy'>, viewer: ViewerContext): boolean {
  return isReportOwner(report, viewer) || isAdminViewer(viewer);
}

function canViewReport(
  report: Pick<ISolarReport, 'submittedBy' | 'status' | 'isPublic' | 'isActive'>,
  viewer?: ViewerContext,
): boolean {
  if (!report.isActive) return false;
  if (canModerateSolarReports(viewer)) return true;
  if (viewer && isReportOwner(report, viewer)) return true;
  return report.status === 'published' && report.isPublic === true;
}

function roundMetric(value: number | null | undefined): number {
  if (!value) return 0;
  return Number(value.toFixed(2));
}

function isTransactionUnsupportedError(error: unknown): boolean {
  const message = (error as { message?: string })?.message ?? '';
  return message.includes('replica set') || message.includes('Transaction numbers');
}

async function runWithOptionalTransaction<T>(
  operation: (session?: mongoose.ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();

  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } catch (error) {
    if (isTransactionUnsupportedError(error)) {
      logger.warn('Solar service: transactions unsupported on this MongoDB instance — falling back to non-transactional execution');
      return operation();
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

function buildAnalyticsEmptyState(): StationAnalytics {
  return {
    hasData: false,
    overview: {
      totalReports: 0,
      avgSolarScore: 0,
      avgEstimatedOutputKw: 0,
      avgActualOutputKw: 0,
      avgAccuracyPct: 0,
      maxSolarScore: 0,
      minSolarScore: 0,
    },
    byDayOfWeek: [],
    byHourOfDay: [],
    accuracyDistribution: [],
    last30Days: [],
  };
}

async function findActiveStation(stationId: string) {
  const station = await Station.findById(stationId).lean();
  if (!station || !station.isActive || station.status !== 'active') {
    throw ApiError.notFound('Station not found');
  }

  return station;
}

export async function createReport(dto: CreateReportDto, userId: string): Promise<ISolarReport> {
  const station = await findActiveStation(dto.stationId);
  const visitedDate = toDate(dto.visitedAt) ?? new Date();
  const dayStart = new Date(visitedDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [lng, lat] = extractCoords(station);
  const weather = await solarWeatherService.getCurrentWeather(lat, lng);
  const calc = calculateSolarOutput(station.solarPanelKw, weather);

  const report = await runWithOptionalTransaction(async (session) => {
    const existingTodayQuery = SolarReport.findOne({
      station: dto.stationId,
      submittedBy: userId,
      visitedAt: { $gte: dayStart, $lte: dayEnd },
      isActive: true,
    });
    const existingToday = session
      ? await existingTodayQuery.session(session).lean()
      : await existingTodayQuery.lean();

    if (existingToday) {
      throw ApiError.conflict('You have already submitted a solar report for this station today.');
    }

    const [created] = session
      ? await SolarReport.create([
        {
          station: dto.stationId,
          submittedBy: userId,
          visitedAt: visitedDate,
          weatherSnapshot: {
            cloudCoverPct: weather.cloudCoverPct,
            uvIndex: weather.uvIndex,
            temperatureC: weather.temperatureC,
            windSpeedKph: weather.windSpeedKph,
            weatherMain: weather.weatherMain,
            weatherIcon: weather.weatherIcon,
            capturedAt: weather.capturedAt,
            isFallback: weather.isFallback ?? false,
          },
          estimatedOutputKw: calc.estimatedOutputKw,
          actualOutputKw: dto.actualOutputKw ?? null,
          solarScore: calc.solarScore,
          notes: dto.notes ?? null,
          isPublic: dto.isPublic ?? true,
          status: 'published',
        },
      ], { session })
      : await SolarReport.create([
        {
          station: dto.stationId,
          submittedBy: userId,
          visitedAt: visitedDate,
          weatherSnapshot: {
            cloudCoverPct: weather.cloudCoverPct,
            uvIndex: weather.uvIndex,
            temperatureC: weather.temperatureC,
            windSpeedKph: weather.windSpeedKph,
            weatherMain: weather.weatherMain,
            weatherIcon: weather.weatherIcon,
            capturedAt: weather.capturedAt,
            isFallback: weather.isFallback ?? false,
          },
          estimatedOutputKw: calc.estimatedOutputKw,
          actualOutputKw: dto.actualOutputKw ?? null,
          solarScore: calc.solarScore,
          notes: dto.notes ?? null,
          isPublic: dto.isPublic ?? true,
          status: 'published',
        },
      ]);

    if (session) {
      await AuditLog.create([
        {
          actor: userObjectId(userId),
          action: 'solar.report.create',
          resource: 'solar_report',
          resourceId: created._id,
          after: {
            stationId: dto.stationId,
            isPublic: created.isPublic,
            status: created.status,
            solarScore: created.solarScore,
          },
        },
      ], { session });
    } else {
      await AuditLog.create([
        {
          actor: userObjectId(userId),
          action: 'solar.report.create',
          resource: 'solar_report',
          resourceId: created._id,
          after: {
            stationId: dto.stationId,
            isPublic: created.isPublic,
            status: created.status,
            solarScore: created.solarScore,
          },
        },
      ]);
    }

    return created;
  });

  logger.info('createReport: solar report created', {
    reportId: report._id,
    stationId: dto.stationId,
    userId,
  });

  report.accuracyLabel = getAccuracyLabel(report.accuracyPct);
  return report;
}

export async function getReports(
  query: ReportQuery,
  viewer?: ViewerContext,
): Promise<PaginatedResult<ISolarReport>> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(50, Math.max(1, query.limit ?? 10));
  const skip = (page - 1) * limit;
  const requestedUserId = query.userId ?? query.submittedBy;

  const filter: Record<string, unknown> = { isActive: true };

  if (query.stationId) filter['station'] = new Types.ObjectId(query.stationId);
  if (requestedUserId) filter['submittedBy'] = new Types.ObjectId(requestedUserId);
  if (query.status) filter['status'] = query.status;
  if (query.isPublic !== undefined) filter['isPublic'] = query.isPublic;
  if (query.minScore !== undefined) filter['solarScore'] = { $gte: query.minScore };

  const dateFrom = toDate(query.dateFrom ?? query.from);
  const dateTo = toDate(query.dateTo ?? query.to);
  if (dateFrom || dateTo) {
    const range: Record<string, Date> = {};
    if (dateFrom) range['$gte'] = dateFrom;
    if (dateTo) range['$lte'] = dateTo;
    filter['visitedAt'] = range;
  }

  if (!canModerateSolarReports(viewer) && !(viewer?._id && requestedUserId === viewer._id)) {
    if (viewer?._id) {
      filter['$or'] = [
        { status: 'published', isPublic: true },
        { submittedBy: new Types.ObjectId(viewer._id) },
      ];
    } else {
      filter['status'] = 'published';
      filter['isPublic'] = true;
    }
  }

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    newest: { visitedAt: -1 },
    oldest: { visitedAt: 1 },
    'highest-score': { solarScore: -1 },
    'most-accurate': { accuracyPct: -1 },
    score: { solarScore: -1 },
  };
  const sort = sortMap[query.sort ?? 'newest'] ?? sortMap['newest'];

  const [data, total] = await Promise.all([
    SolarReport.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('station', 'name solarPanelKw address.city')
      .populate('submittedBy', 'displayName avatarUrl')
      .lean(),
    SolarReport.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: data.map((report) => ({
      ...(report as unknown as ISolarReport),
      accuracyLabel: getAccuracyLabel((report as ISolarReport).accuracyPct),
    })),
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

export async function getReportById(id: string, viewer?: ViewerContext): Promise<ISolarReport> {
  if (!Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest('Invalid report id');
  }

  const report = await SolarReport.findOne({ _id: id, isActive: true })
    .populate('station', 'name solarPanelKw address.city location')
    .populate('submittedBy', 'displayName avatarUrl');

  if (!report || !canViewReport(report, viewer)) {
    throw ApiError.notFound('Solar report not found');
  }

  report.accuracyLabel = getAccuracyLabel(report.accuracyPct);
  return report;
}

export async function updateReport(
  id: string,
  dto: UpdateReportDto,
  userId: string,
  userRole: string,
  userRoleLevel = 0,
): Promise<ISolarReport> {
  const viewer: ViewerContext = { _id: userId, role: userRole, roleLevel: userRoleLevel };

  const updatedReport = await runWithOptionalTransaction(async (session) => {
    const reportQuery = SolarReport.findOne({ _id: id, isActive: true });
    const report = session ? await reportQuery.session(session) : await reportQuery;
    if (!report) throw ApiError.notFound('Solar report not found');
    if (!canManageReport(report, viewer)) {
      throw ApiError.forbidden('You can only edit your own reports.');
    }

    const before = {
      actualOutputKw: report.actualOutputKw,
      notes: report.notes,
      isPublic: report.isPublic,
    };

    if (dto.actualOutputKw !== undefined) report.actualOutputKw = dto.actualOutputKw ?? null;
    if (dto.notes !== undefined) report.notes = dto.notes ?? null;
    if (dto.isPublic !== undefined) report.isPublic = dto.isPublic;

    if (session) {
      await report.save({ session });
      await AuditLog.create([
        {
          actor: userObjectId(userId),
          action: 'solar.report.update',
          resource: 'solar_report',
          resourceId: report._id,
          before,
          after: {
            actualOutputKw: report.actualOutputKw,
            notes: report.notes,
            isPublic: report.isPublic,
          },
        },
      ], { session });
    } else {
      await report.save();
      await AuditLog.create([
        {
          actor: userObjectId(userId),
          action: 'solar.report.update',
          resource: 'solar_report',
          resourceId: report._id,
          before,
          after: {
            actualOutputKw: report.actualOutputKw,
            notes: report.notes,
            isPublic: report.isPublic,
          },
        },
      ]);
    }

    return report;
  });

  updatedReport.accuracyLabel = getAccuracyLabel(updatedReport.accuracyPct);
  return updatedReport;
}

export async function deleteReport(
  id: string,
  userId: string,
  userRole: string,
  userRoleLevel = 0,
): Promise<void> {
  const viewer: ViewerContext = { _id: userId, role: userRole, roleLevel: userRoleLevel };

  await runWithOptionalTransaction(async (session) => {
    const reportQuery = SolarReport.findOne({ _id: id, isActive: true });
    const report = session ? await reportQuery.session(session) : await reportQuery;
    if (!report) throw ApiError.notFound('Solar report not found');
    if (!canManageReport(report, viewer)) {
      throw ApiError.forbidden('You can only delete your own reports.');
    }

    report.isActive = false;
    report.deletedAt = new Date();
    report.deletedBy = userObjectId(userId);

    if (session) {
      await report.save({ session });
      await AuditLog.create([
        {
          actor: userObjectId(userId),
          action: 'solar.report.delete',
          resource: 'solar_report',
          resourceId: report._id,
          before: { status: report.status, isPublic: report.isPublic },
          after: { isActive: false },
        },
      ], { session });
    } else {
      await report.save();
      await AuditLog.create([
        {
          actor: userObjectId(userId),
          action: 'solar.report.delete',
          resource: 'solar_report',
          resourceId: report._id,
          before: { status: report.status, isPublic: report.isPublic },
          after: { isActive: false },
        },
      ]);
    }
  });

  logger.info('deleteReport: solar report soft-deleted', { reportId: id, deletedBy: userId });
}

export async function publishReport(
  id: string,
  userId: string,
  userRole: string,
  userRoleLevel = 0,
): Promise<ISolarReport> {
  const viewer: ViewerContext = { _id: userId, role: userRole, roleLevel: userRoleLevel };

  const publishedReport = await runWithOptionalTransaction(async (session) => {
    const reportQuery = SolarReport.findOne({ _id: id, isActive: true });
    const report = session ? await reportQuery.session(session) : await reportQuery;
    if (!report) throw ApiError.notFound('Solar report not found');

    if (report.status === 'published') {
      throw ApiError.badRequest('Report is already published.');
    }

    if (report.status === 'archived') {
      if (!canModerateSolarReports(viewer)) {
        throw ApiError.forbidden('Only moderators, weather analysts, and admins can restore archived reports.');
      }
    } else if (!canManageReport(report, viewer)) {
      throw ApiError.forbidden('You can only publish your own reports.');
    }

    const previousStatus = report.status;
    report.status = 'published';

    if (session) {
      await report.save({ session });
      await AuditLog.create([
        {
          actor: userObjectId(userId),
          action: 'solar.report.publish',
          resource: 'solar_report',
          resourceId: report._id,
          before: { status: previousStatus },
          after: { status: 'published' },
        },
      ], { session });
    } else {
      await report.save();
      await AuditLog.create([
        {
          actor: userObjectId(userId),
          action: 'solar.report.publish',
          resource: 'solar_report',
          resourceId: report._id,
          before: { status: previousStatus },
          after: { status: 'published' },
        },
      ]);
    }

    return report;
  });

  publishedReport.accuracyLabel = getAccuracyLabel(publishedReport.accuracyPct);
  logger.info('publishReport: solar report published', { reportId: id, publishedBy: userId });
  return publishedReport;
}

export async function archiveReport(
  id: string,
  userId: string,
  userRole: string,
  userRoleLevel = 0,
): Promise<ISolarReport> {
  const viewer: ViewerContext = { _id: userId, role: userRole, roleLevel: userRoleLevel };

  if (!canModerateSolarReports(viewer)) {
    throw ApiError.forbidden('Only moderators, weather analysts, and admins can archive solar reports');
  }

  const archivedReport = await runWithOptionalTransaction(async (session) => {
    const reportQuery = SolarReport.findOne({ _id: id, isActive: true });
    const report = session ? await reportQuery.session(session) : await reportQuery;
    if (!report) throw ApiError.notFound('Solar report not found');
    if (report.status === 'archived') {
      throw ApiError.badRequest('Report is already archived');
    }

    const beforeStatus = report.status;
    report.status = 'archived';

    if (session) {
      await report.save({ session });
      await AuditLog.create([
        {
          actor: userObjectId(userId),
          action: 'solar.report.archive',
          resource: 'solar_report',
          resourceId: report._id,
          before: { status: beforeStatus },
          after: { status: 'archived' },
        },
      ], { session });
    } else {
      await report.save();
      await AuditLog.create([
        {
          actor: userObjectId(userId),
          action: 'solar.report.archive',
          resource: 'solar_report',
          resourceId: report._id,
          before: { status: beforeStatus },
          after: { status: 'archived' },
        },
      ]);
    }

    return report;
  });

  archivedReport.accuracyLabel = getAccuracyLabel(archivedReport.accuracyPct);
  logger.info('archiveReport: solar report archived', { reportId: id, archivedBy: userId });
  return archivedReport;
}

export async function getStationAnalytics(stationId: string): Promise<StationAnalytics> {
  if (!Types.ObjectId.isValid(stationId)) {
    throw ApiError.badRequest('Invalid station id');
  }

  const stationOid = new Types.ObjectId(stationId);
  const [result] = await SolarReport.aggregate<{
    overview: Array<{
      _id: null;
      totalReports: number;
      avgSolarScore: number;
      avgEstimatedOutputKw: number;
      avgActualOutputKw: number;
      avgAccuracyPct: number;
      maxSolarScore: number;
      minSolarScore: number;
    }>;
    byDayOfWeek: Array<{ _id: number; avgScore: number; count: number }>;
    byHourOfDay: Array<{ _id: number; avgScore: number; count: number }>;
    accuracyDistribution: Array<{ _id: number | string; count: number; avgScore: number }>;
    last30Days: Array<{ _id: string; avgScore: number; reportCount: number }>;
  }>([
    {
      $match: {
        station: stationOid,
        isActive: true,
        status: 'published',
        isPublic: true,
      },
    },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              totalReports: { $sum: 1 },
              avgSolarScore: { $avg: '$solarScore' },
              avgEstimatedOutputKw: { $avg: '$estimatedOutputKw' },
              avgActualOutputKw: { $avg: '$actualOutputKw' },
              avgAccuracyPct: { $avg: '$accuracyPct' },
              maxSolarScore: { $max: '$solarScore' },
              minSolarScore: { $min: '$solarScore' },
            },
          },
        ],
        byDayOfWeek: [
          {
            $group: {
              _id: { $dayOfWeek: '$visitedAt' },
              avgScore: { $avg: '$solarScore' },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
        byHourOfDay: [
          {
            $group: {
              _id: { $hour: '$visitedAt' },
              avgScore: { $avg: '$solarScore' },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
        accuracyDistribution: [
          { $match: { accuracyPct: { $ne: null } } },
          {
            $bucket: {
              groupBy: '$accuracyPct',
              boundaries: [0, 50, 70, 90, 110, 130, 201],
              default: 'Other',
              output: {
                count: { $sum: 1 },
                avgScore: { $avg: '$solarScore' },
              },
            },
          },
        ],
        last30Days: [
          {
            $match: {
              visitedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$visitedAt' } },
              avgScore: { $avg: '$solarScore' },
              reportCount: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  if (!result?.overview?.length || result.overview[0].totalReports === 0) {
    return buildAnalyticsEmptyState();
  }

  const overview = result.overview[0];
  return {
    hasData: true,
    overview: {
      totalReports: overview.totalReports,
      avgSolarScore: roundMetric(overview.avgSolarScore),
      avgEstimatedOutputKw: roundMetric(overview.avgEstimatedOutputKw),
      avgActualOutputKw: roundMetric(overview.avgActualOutputKw),
      avgAccuracyPct: roundMetric(overview.avgAccuracyPct),
      maxSolarScore: roundMetric(overview.maxSolarScore),
      minSolarScore: roundMetric(overview.minSolarScore),
    },
    byDayOfWeek: result.byDayOfWeek.map((item) => ({
      _id: item._id,
      avgScore: roundMetric(item.avgScore),
      count: item.count,
    })),
    byHourOfDay: result.byHourOfDay.map((item) => ({
      _id: item._id,
      avgScore: roundMetric(item.avgScore),
      count: item.count,
    })),
    accuracyDistribution: result.accuracyDistribution.map((item) => ({
      _id: item._id,
      count: item.count,
      avgScore: roundMetric(item.avgScore),
    })),
    last30Days: result.last30Days.map((item) => ({
      _id: item._id,
      avgScore: roundMetric(item.avgScore),
      reportCount: item.reportCount,
    })),
  };
}

export async function getLiveWeather(stationId: string): Promise<LiveWeatherResponse> {
  const station = await findActiveStation(stationId);
  const [lng, lat] = extractCoords(station);
  const weather = await solarWeatherService.getCurrentWeather(lat, lng);
  const calc = calculateSolarOutput(station.solarPanelKw, weather);

  return {
    station: {
      _id: stationId,
      name: station.name,
      solarPanelKw: station.solarPanelKw,
      address: { city: station.address?.city ?? null },
    },
    weather,
    solar: {
      estimatedOutputKw: calc.estimatedOutputKw,
      solarScore: calc.solarScore,
      cloudFactor: calc.cloudFactor,
      uvFactor: calc.uvFactor,
    },
    generatedAt: new Date(),
  };
}

export async function getForecastWithSolar(stationId: string): Promise<ForecastWithSolarResponse> {
  const station = await findActiveStation(stationId);
  const [lng, lat] = extractCoords(station);
  const rawForecast = await solarWeatherService.getForecast(lat, lng);
  const forecast = rawForecast.map((slot) => {
    const calc = calculateSolarOutput(station.solarPanelKw, slot);
    return {
      ...slot,
      estimatedOutputKw: calc.estimatedOutputKw,
      solarScore: calc.solarScore,
    };
  });

  return {
    station: {
      _id: stationId,
      name: station.name,
      solarPanelKw: station.solarPanelKw,
    },
    forecast,
    bestWindows: getBestChargingWindows(forecast, station.solarPanelKw),
    generatedAt: new Date(),
  };
}

const solarService = {
  createReport,
  getReports,
  getReportById,
  updateReport,
  deleteReport,
  publishReport,
  archiveReport,
  getStationAnalytics,
  getLiveWeather,
  getForecastWithSolar,
};

export default solarService;
