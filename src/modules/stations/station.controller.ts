import { Request, Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import ApiResponse from '@utils/ApiResponse';
import * as stationService from './station.service';

export const listStations = asyncHandler(async (req: Request, res: Response) => {
  const {
    page = 1,
    limit = 10,
    search,
    lat,
    lng,
    radius,
    connectorType,
    minRating,
    isVerified,
    amenities,
    sortBy,
  } = req.query as Record<string, string | undefined>;

  const { stations, pagination } = await stationService.listStations({
    page: Number(page),
    limit: Number(limit),
    search: search as string | undefined,
    lat: lat !== undefined ? Number(lat) : undefined,
    lng: lng !== undefined ? Number(lng) : undefined,
    radius: radius !== undefined ? Number(radius) : undefined,
    connectorType: connectorType as string | undefined,
    minRating: minRating !== undefined ? Number(minRating) : undefined,
    isVerified:
      isVerified !== undefined ? isVerified === 'true' : undefined,
    amenities: amenities as string | string[] | undefined,
    sortBy: sortBy as stationService.ListStationsOptions['sortBy'],
  });

  return ApiResponse.paginated(res, stations, pagination, 'Stations retrieved successfully');
});

export const getNearbyStations = asyncHandler(async (req: Request, res: Response) => {
  const { lat, lng, radius = '10', limit = '20' } = req.query as Record<string, string>;

  const stations = await stationService.getNearbyStations({
    lat: Number(lat),
    lng: Number(lng),
    radius: Number(radius),
    limit: Number(limit),
  });

  return ApiResponse.success(res, stations, 'Nearby stations retrieved successfully');
});

export const searchStations = asyncHandler(async (req: Request, res: Response) => {
  const { q, page = '1', limit = '10', sortBy = 'newest' } = req.query as Record<string, string>;

  const { stations, pagination } = await stationService.listStations({
    page: Number(page),
    limit: Number(limit),
    search: q,
    sortBy: sortBy as stationService.ListStationsOptions['sortBy'],
  });

  return ApiResponse.paginated(res, stations, pagination, 'Stations retrieved successfully');
});

export const getPendingStations = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '10' } = req.query as Record<string, string>;

  const { stations, pagination } = await stationService.getPendingStations(
    Number(page),
    Number(limit)
  );

  return ApiResponse.paginated(res, stations, pagination, 'Pending stations retrieved successfully');
});

export const getStationById = asyncHandler(async (req: Request, res: Response) => {
  const station = await stationService.getStationById(req.params.id as string);
  return ApiResponse.success(res, station, 'Station retrieved successfully');
});

export const createStation = asyncHandler(async (req: Request, res: Response) => {
  const station = await stationService.createStation({
    ...req.body as Record<string, unknown>,
    submittedBy: req.user!._id,
  } as stationService.CreateStationInput);

  return ApiResponse.created(res, station, 'Station submitted successfully and is pending review');
});

export const updateStation = asyncHandler(async (req: Request, res: Response) => {
  const station = await stationService.updateStation(
    req.params.id as string,
    req.body as stationService.UpdateStationInput,
    req.user!._id
  );

  return ApiResponse.success(res, station, 'Station updated successfully');
});

export const featureStation = asyncHandler(async (req: Request, res: Response) => {
  const station = await stationService.featureStation(
    req.params.id as string,
    req.user!._id
  );
  const message = (station as { isFeatured: boolean }).isFeatured
    ? 'Station has been featured'
    : 'Station has been unfeatured';
  return ApiResponse.success(res, station, message);
});

export const getStationStats = asyncHandler(async (req: Request, res: Response) => {
  const stats = await stationService.getStationStats(req.params.id as string);
  return ApiResponse.success(res, stats, 'Station statistics retrieved successfully');
});

export const approveStation = asyncHandler(async (req: Request, res: Response) => {
  const station = await stationService.approveStation(req.params.id as string, req.user!._id);
  return ApiResponse.success(res, station, 'Station approved and is now active');
});

export const rejectStation = asyncHandler(async (req: Request, res: Response) => {
  const { rejectionReason } = req.body as { rejectionReason: string };

  const station = await stationService.rejectStation(
    req.params.id as string,
    rejectionReason,
    req.user!._id
  );

  return ApiResponse.success(res, station, 'Station rejected');
});

export const deleteStation = asyncHandler(async (req: Request, res: Response) => {
  await stationService.deleteStation(req.params.id as string, req.user!._id);
  return ApiResponse.noContent(res);
});
