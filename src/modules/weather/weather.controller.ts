/**
 * Weather controller — thin HTTP layer.
 *
 * Owner: Member 3 (Solar Intelligence & Weather).
 *
 * TODO: Member 3 — uncomment service calls when WeatherService methods are implemented.
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Weather (6 endpoints)
 */

import { Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import ApiResponse  from '@utils/ApiResponse';
import type { AuthRequest } from '@/types';
// import WeatherService from './weather.service';

/** GET /stations/:id/weather */
export const getCurrentWeather = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 3
  // const data = await WeatherService.getCurrentWeather(req.params.id);
  // res.status(200).json(ApiResponse.success(data, 'Current weather fetched'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'getCurrentWeather: not yet implemented'));
});

/** GET /stations/:id/forecast */
export const getForecast = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 3
  // const forecast = await WeatherService.getForecast(req.params.id);
  // res.status(200).json(ApiResponse.success(forecast, 'Forecast fetched'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'getForecast: not yet implemented'));
});

/** GET /stations/:id/best-times */
export const getBestTimes = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 3
  // const slots = await WeatherService.getBestTimes(req.params.id);
  // res.status(200).json(ApiResponse.success(slots, 'Best times fetched'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'getBestTimes: not yet implemented'));
});

/** GET /weather/heatmap */
export const getSolarHeatmap = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 3
  // const points = await WeatherService.getSolarHeatmap();
  // res.status(200).json(ApiResponse.success(points, 'Solar heatmap fetched'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'getSolarHeatmap: not yet implemented'));
});

/** POST /admin/weather/refresh */
export const bulkRefresh = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 3
  // const result = await WeatherService.bulkRefresh(req.body);
  // res.status(200).json(ApiResponse.success(result, 'Weather cache refreshed'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'bulkRefresh: not yet implemented'));
});

/** GET /admin/weather/export */
export const exportWeatherData = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 3
  // await WeatherService.exportWeatherData(req.query as any);
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'exportWeatherData: not yet implemented'));
});
