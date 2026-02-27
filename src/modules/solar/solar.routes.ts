/**
 * Solar routes — 9 endpoints under /api/solar
 *
 * Route registration order rule: static paths before dynamic /:id catch-alls.
 *  /reports         → static (before /:id)
 *  /stations/:stationId/live-weather → static subdirectory with param
 *
 * Middleware chain: protect → validate → controller
 * (checkPermission omitted for weather.read because it is a public permission;
 *  access control is enforced by protect for mutations.)
 *
 * Owner: Member 3 · Mount point in app.ts: app.use('/api/solar', solarRouter)
 */

import { Router }          from 'express';
import { protect }         from '@middleware/auth.middleware';
import { validate }        from '@middleware/validate.middleware';
import * as SolarController from './solar.controller';
import * as V               from './solar.validation';

const router = Router();

// ── Station-scoped public endpoints ──────────────────────────────────────────
// No auth required — weather.read is public permission (level 0)

/**
 * GET /api/solar/stations/:stationId/live-weather
 * Live weather + solar output prediction for a station.
 */
router.get(
  '/stations/:stationId/live-weather',
  validate(V.stationIdParamSchema, 'params'),
  SolarController.getLiveWeather,
);

/**
 * GET /api/solar/stations/:stationId/forecast
 * 5-day solar forecast + best charging windows.
 */
router.get(
  '/stations/:stationId/forecast',
  validate(V.stationIdParamSchema, 'params'),
  SolarController.getForecast,
);

/**
 * GET /api/solar/stations/:stationId/analytics
 * Aggregated crowdsourced analytics for a station.
 */
router.get(
  '/stations/:stationId/analytics',
  validate(V.stationIdParamSchema, 'params'),
  SolarController.getStationAnalytics,
);

// ── Report collection endpoints (static) ─────────────────────────────────────
// Must come before /:id routes to avoid shadowing.

/**
 * GET /api/solar/reports
 * Paginated list with filters.
 */
router.get(
  '/reports',
  validate(V.getReportsSchema, 'query'),
  SolarController.getReports,
);

/**
 * POST /api/solar/reports
 * Create a new solar report (auth required).
 */
router.post(
  '/reports',
  protect,
  validate(V.createReportSchema),
  SolarController.createReport,
);

// ── Report instance endpoints (dynamic :id) ───────────────────────────────────

/**
 * GET /api/solar/reports/:id
 */
router.get(
  '/reports/:id',
  validate(V.reportIdParamSchema, 'params'),
  SolarController.getReportById,
);

/**
 * PUT /api/solar/reports/:id
 */
router.put(
  '/reports/:id',
  protect,
  validate(V.reportIdParamSchema, 'params'),
  validate(V.updateReportSchema),
  SolarController.updateReport,
);

/**
 * DELETE /api/solar/reports/:id
 */
router.delete(
  '/reports/:id',
  protect,
  validate(V.reportIdParamSchema, 'params'),
  SolarController.deleteReport,
);

/**
 * PATCH /api/solar/reports/:id/publish
 * Static "publish" suffix must be registered before /:id to avoid ambiguity.
 */
router.patch(
  '/reports/:id/publish',
  protect,
  validate(V.reportIdParamSchema, 'params'),
  SolarController.publishReport,
);

export default router;
