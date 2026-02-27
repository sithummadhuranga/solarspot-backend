/**
 * Solar controller — thin HTTP layer for Solar Intelligence & Charging Analytics.
 *
 * Every handler is wrapped in asyncHandler — no try/catch in this file.
 * All business logic lives in solarService. Controllers receive → delegate → respond.
 *
 * Swagger JSDoc blocks provide the complete API specification for evaluators.
 *
 * Owner: Member 3 · Ref: SolarIntelligence_Module_Prompt.md → A5
 */

import { Response }  from 'express';
import asyncHandler  from '@middleware/asyncHandler';
import ApiResponse   from '@utils/ApiResponse';
import solarService  from './solar.service';
import type { AuthRequest }    from '@/types';
import type { CreateReportDto, UpdateReportDto, ReportQuery } from './solar.service';

// ── Public: weather intel endpoints ──────────────────────────────────────────

/**
 * @swagger
 * /api/solar/stations/{stationId}/live-weather:
 *   get:
 *     summary: Live weather + solar output prediction for a station
 *     description: >
 *       Returns real-time weather conditions for the station's location, annotated
 *       with the estimated solar panel output in kW and a 0–10 solar quality score.
 *       Responses are cached for 30 minutes. UV index is estimated from cloud cover
 *       when not provided by the OWM free tier.
 *     tags: [Solar Intelligence]
 *     parameters:
 *       - in: path
 *         name: stationId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *         description: MongoDB ObjectId of the station
 *     responses:
 *       200:
 *         description: Live weather + solar prediction
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/LiveWeatherResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       503:
 *         description: OpenWeatherMap API temporarily unavailable
 *     x-permission: weather.read
 *     x-policies: []
 *     x-roles: [guest, user, station_owner, moderator, admin]
 *     x-min-role: 0
 *     x-component: solar
 */
export const getLiveWeather = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await solarService.getLiveWeather(req.params['stationId'] as string);
  ApiResponse.success(res, data, 'Live weather and solar prediction fetched');
});

/**
 * @swagger
 * /api/solar/stations/{stationId}/forecast:
 *   get:
 *     summary: 5-day solar forecast with best charging windows
 *     description: >
 *       Returns 40 three-hourly forecast slots (5 days), each annotated with
 *       an estimated solar output in kW and a solar score. Also returns the top
 *       3 best charging windows (daytime, highest solar score).
 *     tags: [Solar Intelligence]
 *     parameters:
 *       - in: path
 *         name: stationId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *     responses:
 *       200:
 *         description: Forecast with solar annotations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/ForecastWithSolarResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       503:
 *         description: OpenWeatherMap API temporarily unavailable
 *     x-permission: weather.read
 *     x-policies: []
 *     x-roles: [guest, user, station_owner, moderator, admin]
 *     x-min-role: 0
 *     x-component: solar
 */
export const getForecast = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await solarService.getForecastWithSolar(req.params['stationId'] as string);
  ApiResponse.success(res, data, 'Solar forecast fetched');
});

/**
 * @swagger
 * /api/solar/stations/{stationId}/analytics:
 *   get:
 *     summary: Crowdsourced analytics for a station
 *     description: >
 *       Runs a MongoDB aggregation pipeline over all published, public SolarReports
 *       for the station. Returns average solar score, accuracy percentage (predicted
 *       vs actual output), and a 30-day daily breakdown for sparkline charts.
 *       Returns hasData: false when no reports exist yet.
 *     tags: [Solar Intelligence]
 *     parameters:
 *       - in: path
 *         name: stationId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *     responses:
 *       200:
 *         description: Station solar analytics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/StationAnalytics'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *     x-permission: weather.read
 *     x-policies: []
 *     x-roles: [guest, user, station_owner, moderator, admin]
 *     x-min-role: 0
 *     x-component: solar
 */
export const getStationAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const analytics = await solarService.getStationAnalytics(req.params['stationId'] as string);
  ApiResponse.success(res, analytics, 'Station analytics fetched');
});

// ── Report CRUD ───────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/solar/reports:
 *   get:
 *     summary: List solar reports (paginated)
 *     description: >
 *       Returns a paginated list of solar reports. Supports filtering by stationId,
 *       submittedBy, status, date range, and sort order. Anonymous users see only
 *       published, public reports; authenticated users can filter by status.
 *     tags: [Solar Intelligence]
 *     parameters:
 *       - in: query
 *         name: stationId
 *         schema: { type: string, pattern: '^[0-9a-fA-F]{24}$' }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, published] }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [newest, oldest, score], default: newest }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 10 }
 *     responses:
 *       200:
 *         description: Paginated list of solar reports
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SolarReport'
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 *       422:
 *         description: Invalid query parameters
 *     x-permission: weather.read
 *     x-policies: []
 *     x-roles: [guest, user, station_owner, moderator, admin]
 *     x-min-role: 0
 *     x-component: solar
 */
export const getReports = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await solarService.getReports(req.query as unknown as ReportQuery);
  ApiResponse.paginated(res, result.data, result.pagination, 'Reports fetched');
});

/**
 * @swagger
 * /api/solar/reports/{id}:
 *   get:
 *     summary: Get a single solar report by ID
 *     tags: [Solar Intelligence]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, pattern: '^[0-9a-fA-F]{24}$' }
 *     responses:
 *       200:
 *         description: Solar report document
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/SolarReport' }
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *     x-permission: weather.read
 *     x-policies: []
 *     x-min-role: 0
 *     x-component: solar
 */
export const getReportById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const report = await solarService.getReportById(req.params['id'] as string);
  ApiResponse.success(res, report);
});

/**
 * @swagger
 * /api/solar/reports:
 *   post:
 *     summary: Submit a new solar output report
 *     description: >
 *       Fetches live weather for the station, calculates the predicted solar output
 *       (estimatedOutputKw), and stores the user's observation alongside it.
 *       If actualOutputKw is provided, an accuracy percentage is automatically
 *       computed (actual ÷ estimated × 100).
 *     tags: [Solar Intelligence]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateReportDto'
 *     responses:
 *       201:
 *         description: Report created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/SolarReport' }
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         description: Validation failed
 *       503:
 *         description: OWM unavailable — cannot compute estimated output
 *     x-permission: weather.read
 *     x-policies: [email_verified_only, active_account_only]
 *     x-roles: [user, station_owner, trusted_reviewer, moderator, admin]
 *     x-min-role: 1
 *     x-component: solar
 */
export const createReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const report = await solarService.createReport(req.body as CreateReportDto, req.user!._id);
  ApiResponse.created(res, report, 'Solar report submitted successfully');
});

/**
 * @swagger
 * /api/solar/reports/{id}:
 *   put:
 *     summary: Update your solar report
 *     description: >
 *       Report owner or admin can update actualOutputKw, notes, and isPublic.
 *       Updating actualOutputKw triggers a recalculation of accuracyPct.
 *     tags: [Solar Intelligence]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, pattern: '^[0-9a-fA-F]{24}$' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateReportDto'
 *     responses:
 *       200:
 *         description: Report updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/SolarReport' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422:
 *         description: Validation failed
 *     x-permission: weather.read
 *     x-policies: [email_verified_only, active_account_only]
 *     x-min-role: 1
 *     x-component: solar
 */
export const updateReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const report = await solarService.updateReport(
    req.params['id'] as string,
    req.body as UpdateReportDto,
    req.user!._id,
    req.user!.role,
  );
  ApiResponse.success(res, report, 'Report updated');
});

/**
 * @swagger
 * /api/solar/reports/{id}:
 *   delete:
 *     summary: Soft-delete a solar report
 *     description: Owner or admin can soft-delete. The record is preserved for analytics.
 *     tags: [Solar Intelligence]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, pattern: '^[0-9a-fA-F]{24}$' }
 *     responses:
 *       204:
 *         description: Report deleted (body is empty)
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *     x-permission: weather.read
 *     x-policies: [email_verified_only, active_account_only]
 *     x-min-role: 1
 *     x-component: solar
 */
export const deleteReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  await solarService.deleteReport(req.params['id'] as string, req.user!._id, req.user!.role);
  ApiResponse.noContent(res);
});

/**
 * @swagger
 * /api/solar/reports/{id}/publish:
 *   patch:
 *     summary: Publish a draft solar report
 *     description: >
 *       Transitions a report from draft → published. Published reports appear
 *       in public listings and are included in station analytics aggregations.
 *       Returns 400 if the report is already published.
 *     tags: [Solar Intelligence]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, pattern: '^[0-9a-fA-F]{24}$' }
 *     responses:
 *       200:
 *         description: Report published
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/SolarReport' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *     x-permission: weather.read
 *     x-policies: [email_verified_only, active_account_only]
 *     x-min-role: 1
 *     x-component: solar
 */
export const publishReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const report = await solarService.publishReport(
    req.params['id'] as string,
    req.user!._id,
    req.user!.role,
  );
  ApiResponse.success(res, report, 'Report published');
});
