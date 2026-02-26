/**
 * Weather routes — 6 endpoints, all under the /api/weather prefix.
 *
 * Route registration order matters here: static paths (/heatmap, /export,
 * /bulk-refresh) MUST appear before the dynamic /:stationId catch-all,
 * otherwise Express will match "heatmap" as a stationId.
 *
 * Middleware chain per MASTER_PROMPT.md:
 *   protect → checkPermission → validate → controller
 *
 * Owner: Member 3 · Ref: PROJECT_OVERVIEW.md → API Endpoints → Weather
 */

import { Router } from 'express';
import { protect }           from '@middleware/auth.middleware';
import { checkPermission }   from '@middleware/rbac.middleware';
import { validate }          from '@middleware/validate.middleware';
import * as WeatherController from './weather.controller';
import * as V                 from './weather.validation';

const router = Router();

// ── Static public routes (registered first to prevent /:stationId shadowing) ──

/**
 * GET /api/weather/heatmap
 * Aggregates solar index from cached data across all stations.
 * Deliberately quota-safe — never calls the OWM API directly.
 */
router.get(
  '/heatmap',
  WeatherController.getSolarHeatmap,
);

// ── Static admin routes ────────────────────────────────────────────────────────

/**
 * POST /api/weather/bulk-refresh
 * Refreshes the weather cache for one-or-more stations.
 * Admin / weather_analyst only.
 */
router.post(
  '/bulk-refresh',
  protect,
  checkPermission('weather.bulk-refresh'),
  validate(V.bulkRefreshSchema),
  WeatherController.bulkRefresh,
);

/**
 * GET /api/weather/export
 * Exports the full weather dataset as JSON or CSV.
 * Admin / weather_analyst only.
 */
router.get(
  '/export',
  protect,
  checkPermission('weather.export'),
  validate(V.exportQuerySchema, 'query'),
  WeatherController.exportWeatherData,
);

// ── Dynamic station-scoped routes (registered after static routes) ─────────────

/**
 * GET /api/weather/best-time/:stationId
 * Returns the best solar-charging windows from the 5-day forecast.
 */
router.get(
  '/best-time/:stationId',
  validate(V.stationIdParamSchema, 'params'),
  WeatherController.getBestTimes,
);

/**
 * GET /api/weather/:stationId
 * Returns current conditions and solar index for a station.
 */
router.get(
  '/:stationId',
  validate(V.stationIdParamSchema, 'params'),
  WeatherController.getCurrentWeather,
);

/**
 * GET /api/weather/:stationId/forecast
 * Returns the 5-day / 3-hourly forecast for a station.
 */
router.get(
  '/:stationId/forecast',
  validate(V.stationIdParamSchema, 'params'),
  WeatherController.getForecast,
);

export default router;
