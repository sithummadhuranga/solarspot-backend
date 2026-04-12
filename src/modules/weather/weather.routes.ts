

import { Router } from 'express';
import { protect }           from '@middleware/auth.middleware';
import { checkPermission }   from '@middleware/rbac.middleware';
import { validate }          from '@middleware/validate.middleware';
import * as WeatherController from './weather.controller';
import * as V                 from './weather.validation';

const router = Router();



router.get(
  '/heatmap',
  WeatherController.getSolarHeatmap,
);



router.post(
  '/bulk-refresh',
  protect,
  checkPermission('weather.bulk-refresh'),
  validate(V.bulkRefreshSchema),
  WeatherController.bulkRefresh,
);


router.get(
  '/export',
  protect,
  checkPermission('weather.export'),
  validate(V.exportQuerySchema, 'query'),
  WeatherController.exportWeatherData,
);



router.get(
  '/best-time/:stationId',
  validate(V.stationIdParamSchema, 'params'),
  WeatherController.getBestTimes,
);


router.get(
  '/:stationId',
  validate(V.stationIdParamSchema, 'params'),
  WeatherController.getCurrentWeather,
);


router.get(
  '/:stationId/forecast',
  validate(V.stationIdParamSchema, 'params'),
  WeatherController.getForecast,
);

export default router;
