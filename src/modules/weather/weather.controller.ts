/**
 * Weather controller — thin HTTP layer for the Solar Intelligence module.
 *
 * Each method does exactly one thing: validate that the service call succeeded,
 * then hand the result to ApiResponse. Error handling is delegated to the global
 * error middleware via asyncHandler — no try/catch in this file.
 *
 * Owner: Member 3 · Ref: PROJECT_OVERVIEW.md → API Endpoints → Weather (6 endpoints)
 *                        MASTER_PROMPT.md → Controller → thin, one service call only
 */

import { Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import ApiResponse  from '@utils/ApiResponse';
import WeatherService from './weather.service';
import type { AuthRequest } from '@/types';
import type { BulkRefreshInput, WeatherExportQuery } from '@/types';

// ── Public endpoints ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/weather/{stationId}:
 *   get:
 *     summary: Current weather and solar index for a station
 *     description: >
 *       Returns real-time weather conditions plus a derived solar index for the
 *       given station. Responses are cached for 30 minutes — the API will not
 *       hit OpenWeatherMap more than once per station per 30-minute window.
 *     tags: [Weather]
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
 *         description: Current weather data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/WeatherData'
 *       404:
 *         description: Station not found
 *       503:
 *         description: OWM daily quota exhausted — cached data unavailable
 *     x-permission: weather.read
 *     x-policies: []
 *     x-roles: [guest, user, station_owner, moderator, admin]
 *     x-min-role: 0
 *     x-component: weather
 */
export const getCurrentWeather = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await WeatherService.getCurrentWeather(req.params['stationId'] as string);
  ApiResponse.success(res, data, 'Current weather fetched');
});

/**
 * @swagger
 * /api/weather/{stationId}/forecast:
 *   get:
 *     summary: 5-day / 3-hourly forecast for a station
 *     description: >
 *       Returns up to 40 three-hour forecast slots (5 days) for the station's
 *       location. UV index is estimated from cloud cover when not provided by
 *       the OWM free-tier endpoint.
 *     tags: [Weather]
 *     parameters:
 *       - in: path
 *         name: stationId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *     responses:
 *       200:
 *         description: Array of forecast slots
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ForecastSlot'
 *       404:
 *         description: Station not found
 *     x-permission: weather.read
 *     x-policies: []
 *     x-roles: [guest, user, station_owner, moderator, admin]
 *     x-min-role: 0
 *     x-component: weather
 */
export const getForecast = asyncHandler(async (req: AuthRequest, res: Response) => {
  const forecast = await WeatherService.getForecast(req.params['stationId'] as string);
  ApiResponse.success(res, forecast, 'Forecast fetched');
});

/**
 * @swagger
 * /api/weather/best-time/{stationId}:
 *   get:
 *     summary: Best solar-charging time windows for a station
 *     description: >
 *       Analyses the 5-day forecast and returns the optimal visit windows
 *       for solar charging. Each slot includes a human-readable reason and
 *       a solar index rating.
 *     tags: [Weather]
 *     parameters:
 *       - in: path
 *         name: stationId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *     responses:
 *       200:
 *         description: Sorted best-time slots
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BestTimeSlot'
 *       404:
 *         description: Station not found
 *     x-permission: weather.read
 *     x-policies: []
 *     x-roles: [guest, user, station_owner, moderator, admin]
 *     x-min-role: 0
 *     x-component: weather
 */
export const getBestTimes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const slots = await WeatherService.getBestTimes(req.params['stationId'] as string);
  ApiResponse.success(res, slots, 'Best charging times calculated');
});

/**
 * @swagger
 * /api/weather/heatmap:
 *   get:
 *     summary: Solar index heatmap across all stations
 *     description: >
 *       Returns lat/lng points for every station that has a warm cache entry,
 *       annotated with its current solar index. Stations without a recent fetch
 *       are omitted. This endpoint never calls the OWM API — it is quota-safe
 *       even when hundreds of stations are on the map.
 *     tags: [Weather]
 *     responses:
 *       200:
 *         description: Array of heatmap points
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/HeatmapPoint'
 *     x-permission: weather.read
 *     x-policies: []
 *     x-roles: [guest, user, station_owner, moderator, admin]
 *     x-min-role: 0
 *     x-component: weather
 */
export const getSolarHeatmap = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const points = await WeatherService.getSolarHeatmap();
  ApiResponse.success(res, points, 'Solar heatmap fetched');
});

// ── Admin endpoints (require weather.bulk-refresh / weather.export) ───────────

/**
 * @swagger
 * /api/weather/bulk-refresh:
 *   post:
 *     summary: Admin — bulk-refresh the weather cache
 *     description: >
 *       Fetches fresh weather data from OpenWeatherMap for the specified stations
 *       (or all approved stations if stationIds is omitted). A 150 ms delay is
 *       enforced between calls to respect the OWM free-tier rate limit.
 *       Quota is checked before each API call — if the daily limit is approaching
 *       the operation stops and returns the counts achieved.
 *     tags: [Weather]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stationIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 maxItems: 100
 *                 description: Leave empty to refresh all approved stations
 *               force:
 *                 type: boolean
 *                 default: false
 *                 description: Bypass the 30-minute cache TTL and refresh regardless
 *     responses:
 *       200:
 *         description: Refresh result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     refreshed: { type: integer }
 *                     failed:    { type: integer }
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Insufficient permissions
 *     x-permission: weather.bulk-refresh
 *     x-policies: [active_account_only]
 *     x-roles: [weather_analyst, admin]
 *     x-min-role: 3
 *     x-component: weather
 */
export const bulkRefresh = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await WeatherService.bulkRefresh(req.body as BulkRefreshInput);
  ApiResponse.success(res, result, `Weather cache refreshed — ${result.refreshed} updated, ${result.failed} failed`);
});

/**
 * @swagger
 * /api/weather/export:
 *   get:
 *     summary: Admin — export the weather dataset
 *     description: >
 *       Returns all cached weather records as JSON (default) or CSV. Use the
 *       `stationId`, `from`, and `to` query params to narrow the export.
 *       The response is sent with a Content-Disposition attachment header so
 *       browsers trigger a file download automatically.
 *     tags: [Weather]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *       - in: query
 *         name: stationId
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: ISO 8601 start date (inclusive)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: ISO 8601 end date (inclusive)
 *     responses:
 *       200:
 *         description: Exported data file
 *         content:
 *           application/json: {}
 *           text/csv: {}
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Insufficient permissions
 *     x-permission: weather.export
 *     x-policies: [active_account_only]
 *     x-roles: [weather_analyst, admin]
 *     x-min-role: 3
 *     x-component: weather
 */
export const exportWeatherData = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await WeatherService.exportWeatherData(req.query as WeatherExportQuery);

  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.status(200).send(result.data);
});
