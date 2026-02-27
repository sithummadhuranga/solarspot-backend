import { Request, Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import ApiResponse from '@utils/ApiResponse';
import * as stationService from './station.service';
import type { CreateStationInput, UpdateStationInput } from '@/types';
type ConnectorTypeAlias = CreateStationInput['connectors'][number]['type'];

export const listStations = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const { page = '1', limit = '10', search, lat, lng, radius, connectorType, minRating, isVerified, amenities, sortBy } = q;

  const { stations, pagination } = await stationService.listStations({
    page: Number(page), limit: Number(limit), search,
    lat:  lat  ? Number(lat)  : undefined,
    lng:  lng  ? Number(lng)  : undefined,
    radius: radius ? Number(radius) : undefined,
    connectorType: connectorType as ConnectorTypeAlias | undefined,
    minRating: minRating ? Number(minRating) : undefined,
    isVerified: isVerified !== undefined ? isVerified === 'true' : undefined,
    amenities,
    sortBy: sortBy as 'newest' | 'rating' | 'distance' | 'featured' | undefined,
  });

  return ApiResponse.paginated(res, stations, pagination, 'Stations retrieved successfully');
});

export const getNearbyStations = asyncHandler(async (req: Request, res: Response) => {
  const { lat, lng, radius = '10', limit = '20' } = req.query as Record<string, string | undefined>;
  const stations = await stationService.getNearbyStations({ lat: Number(lat ?? 0), lng: Number(lng ?? 0), radius: Number(radius), limit: Number(limit) });
  return ApiResponse.success(res, stations, 'Nearby stations retrieved successfully');
});

export const searchStations = asyncHandler(async (req: Request, res: Response) => {
  const { q, page = '1', limit = '10', sortBy = 'newest' } = req.query as Record<string, string | undefined>;
  const { stations, pagination } = await stationService.listStations({ page: Number(page), limit: Number(limit), search: q ?? '', sortBy: sortBy as 'newest' | 'rating' | 'featured' });
  return ApiResponse.paginated(res, stations, pagination, 'Stations retrieved successfully');
});

export const getPendingStations = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '10' } = req.query as Record<string, string | undefined>;
  const { stations, pagination } = await stationService.getPendingStations(Number(page), Number(limit));
  return ApiResponse.paginated(res, stations, pagination, 'Pending stations retrieved successfully');
});

export const getStationById = asyncHandler(async (req: Request, res: Response) => {
  const station = await stationService.getStationById(String(req.params.id));
  return ApiResponse.success(res, station, 'Station retrieved successfully');
});

export const createStation = asyncHandler(async (req: Request, res: Response) => {
  const station = await stationService.createStation({
    ...(req.body as CreateStationInput),
    submittedBy: req.user!._id,
  });
  return ApiResponse.created(res, station, 'Station submitted successfully and is pending review');
});

export const updateStation = asyncHandler(async (req: Request, res: Response) => {
  const station = await stationService.updateStation(String(req.params.id), req.body as UpdateStationInput, req.user!._id);
  return ApiResponse.success(res, station, 'Station updated successfully');
});

export const approveStation = asyncHandler(async (req: Request, res: Response) => {
  const station = await stationService.approveStation(String(req.params.id), req.user!._id);
  return ApiResponse.success(res, station, 'Station approved and is now active');
});

export const rejectStation = asyncHandler(async (req: Request, res: Response) => {
  const { rejectionReason } = req.body as { rejectionReason: string };
  const station = await stationService.rejectStation(String(req.params.id), rejectionReason, req.user!._id);
  return ApiResponse.success(res, station, 'Station rejected');
});

export const deleteStation = asyncHandler(async (req: Request, res: Response) => {
  await stationService.deleteStation(String(req.params.id), req.user!._id);
  return ApiResponse.noContent(res);
});

export const featureStation = asyncHandler(async (req: Request, res: Response) => {
  const station = await stationService.featureStation(String(req.params.id), req.user!._id);
  const message = (station as IStation & { isFeatured: boolean }).isFeatured ? 'Station has been featured' : 'Station has been unfeatured';
  return ApiResponse.success(res, station, message);
});

type IStation = Awaited<ReturnType<typeof stationService.getStationById>>;

export const getStationStats = asyncHandler(async (req: Request, res: Response) => {
  const stats = await stationService.getStationStats(String(req.params.id));
  return ApiResponse.success(res, stats, 'Station statistics retrieved successfully');
});
