/**
 * Station controller — thin HTTP layer.
 *
 * TODO: Member 1 — uncomment service calls when StationService is implemented.
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Stations (11 endpoints)
 */

import { Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import ApiResponse  from '@utils/ApiResponse';
import type { AuthRequest } from '@/types';
// import StationService from './station.service';

/** POST /stations */
export const createStation = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 1
  // const station = await StationService.createStation(req.user!._id.toString(), req.body);
  // res.status(201).json(ApiResponse.success(station, 'Station created'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'createStation: not yet implemented'));
});

/** GET /stations */
export const listStations = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 1
  // const result = await StationService.listStations(req.query as any);
  // res.status(200).json(ApiResponse.success(result, 'Stations fetched'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'listStations: not yet implemented'));
});

/** GET /stations/nearby */
export const getNearbyStations = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 1
  // const stations = await StationService.getNearbyStations(req.query as any);
  // res.status(200).json(ApiResponse.success(stations, 'Nearby stations'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'getNearbyStations: not yet implemented'));
});

/** GET /stations/:id */
export const getStationById = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 1
  // const station = await StationService.getStationById(req.params.id);
  // res.status(200).json(ApiResponse.success(station, 'Station fetched'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'getStationById: not yet implemented'));
});

/** PATCH /stations/:id */
export const updateStation = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 1
  // const station = await StationService.updateStation(req.params.id, req.user!._id.toString(), req.body);
  // res.status(200).json(ApiResponse.success(station, 'Station updated'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'updateStation: not yet implemented'));
});

/** DELETE /stations/:id */
export const deleteStation = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 1
  // await StationService.deleteStation(req.params.id, req.user!._id.toString());
  // res.status(204).send();
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'deleteStation: not yet implemented'));
});

/** PATCH /admin/stations/:id/approve */
export const approveStation = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 1
  // const station = await StationService.approveStation(req.params.id);
  // res.status(200).json(ApiResponse.success(station, 'Station approved'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'approveStation: not yet implemented'));
});

/** PATCH /admin/stations/:id/reject */
export const rejectStation = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 1
  // const station = await StationService.rejectStation(req.params.id, req.body.reason);
  // res.status(200).json(ApiResponse.success(station, 'Station rejected'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'rejectStation: not yet implemented'));
});

/** GET /admin/stations */
export const adminListStations = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 1
  // const result = await StationService.adminListStations(req.query as any);
  // res.status(200).json(ApiResponse.success(result, 'Stations fetched'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'adminListStations: not yet implemented'));
});

/** GET /stations/:id/weather — Member 3 coordinates from WeatherService */
export const getStationWeather = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 1 — wire to WeatherService (Member 3 implements)
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'getStationWeather: pending Member 3'));
});

/** GET /stations/:id/best-times — Member 3 coordinates from WeatherService */
export const getStationBestTimes = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 1 — wire to WeatherService (Member 3 implements)
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'getStationBestTimes: pending Member 3'));
});
