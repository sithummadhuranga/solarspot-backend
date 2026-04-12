

import { Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import ApiResponse  from '@utils/ApiResponse';
import WeatherService from './weather.service';
import type { AuthRequest } from '@/types';
import type { BulkRefreshInput, WeatherExportQuery } from '@/types';



export const getCurrentWeather = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await WeatherService.getCurrentWeather(req.params['stationId'] as string);
  ApiResponse.success(res, data, 'Current weather fetched');
});


export const getForecast = asyncHandler(async (req: AuthRequest, res: Response) => {
  const forecast = await WeatherService.getForecast(req.params['stationId'] as string);
  ApiResponse.success(res, forecast, 'Forecast fetched');
});


export const getBestTimes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const slots = await WeatherService.getBestTimes(req.params['stationId'] as string);
  ApiResponse.success(res, slots, 'Best charging times calculated');
});


export const getSolarHeatmap = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const points = await WeatherService.getSolarHeatmap();
  ApiResponse.success(res, points, 'Solar heatmap fetched');
});



export const bulkRefresh = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await WeatherService.bulkRefresh(req.body as BulkRefreshInput);
  ApiResponse.success(res, result, `Weather cache refreshed — ${result.refreshed} updated, ${result.failed} failed`);
});


export const exportWeatherData = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await WeatherService.exportWeatherData(req.query as WeatherExportQuery);

  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.status(200).send(result.data);
});
