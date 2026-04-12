

import { Router }          from 'express';
import { optionalAuth, protect } from '@middleware/auth.middleware';
import { checkPermission } from '@middleware/rbac.middleware';
import { validate }        from '@middleware/validate.middleware';
import * as SolarController from './solar.controller';
import * as V               from './solar.validation';

const router = Router();



router.get(
  '/stations/:stationId/live-weather',
  validate(V.stationIdParamSchema, 'params'),
  SolarController.getLiveWeather,
);


router.get(
  '/stations/:stationId/forecast',
  validate(V.stationIdParamSchema, 'params'),
  SolarController.getForecast,
);


router.get(
  '/stations/:stationId/analytics',
  validate(V.stationIdParamSchema, 'params'),
  SolarController.getStationAnalytics,
);



router.get(
  '/reports',
  validate(V.getReportsSchema, 'query'),
  optionalAuth,
  SolarController.getReports,
);


router.post(
  '/reports',
  protect,
  checkPermission('reviews.create'),
  validate(V.createReportSchema),
  SolarController.createReport,
);



router.get(
  '/reports/:id',
  optionalAuth,
  validate(V.reportIdParamSchema, 'params'),
  SolarController.getReportById,
);


router.put(
  '/reports/:id',
  protect,
  checkPermission('reviews.create'),
  validate(V.reportIdParamSchema, 'params'),
  validate(V.updateReportSchema),
  SolarController.updateReport,
);


router.delete(
  '/reports/:id',
  protect,
  checkPermission('reviews.create'),
  validate(V.reportIdParamSchema, 'params'),
  SolarController.deleteReport,
);


router.patch(
  '/reports/:id/publish',
  protect,
  checkPermission('reviews.create'),
  validate(V.reportIdParamSchema, 'params'),
  SolarController.publishReport,
);


router.patch(
  '/reports/:id/archive',
  protect,
  checkPermission('weather.admin'),
  validate(V.reportIdParamSchema, 'params'),
  SolarController.archiveReport,
);

export default router;
