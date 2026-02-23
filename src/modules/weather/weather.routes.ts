/**
 * Weather routes — 6 endpoints.
 *
 * Owner: Member 3 (Solar Intelligence & Weather).
 *
 * TODO: Member 3 — uncomment routes when controller/service are implemented.
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Weather
 *      MASTER_PROMPT.md → Route Middleware Order: protect → checkPermission → validate → controller
 */

import { Router } from 'express';
// import { protect }             from '@middleware/auth.middleware';
// import { checkPermission }     from '@middleware/rbac.middleware';
// import { validate }            from '@middleware/validate.middleware';
// import * as WeatherController  from './weather.controller';
// import * as V                  from './weather.validation';

const router = Router();

// ─── Station-scoped (also wired from station.routes.ts) ──────────────────────
// router.get('/stations/:id/weather',     WeatherController.getCurrentWeather);
// router.get('/stations/:id/forecast',    WeatherController.getForecast);
// router.get('/stations/:id/best-times',  WeatherController.getBestTimes);

// ─── Global ───────────────────────────────────────────────────────────────────
// router.get('/weather/heatmap', WeatherController.getSolarHeatmap);

// ─── Admin ───────────────────────────────────────────────────────────────────
// router.post('/admin/weather/refresh', protect, checkPermission('weather.refresh'), WeatherController.bulkRefresh);
// router.get('/admin/weather/export',   protect, checkPermission('weather.export'),  validate(V.exportQuerySchema), WeatherController.exportWeatherData);

export default router;
