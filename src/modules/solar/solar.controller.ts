

import { Response }  from 'express';
import asyncHandler  from '@middleware/asyncHandler';
import ApiResponse   from '@utils/ApiResponse';
import solarService  from './solar.service';
import type { AuthRequest }    from '@/types';
import type { CreateReportDto, UpdateReportDto, ReportQuery } from './solar.service';



export const getLiveWeather = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await solarService.getLiveWeather(req.params['stationId'] as string);
  ApiResponse.success(res, data, 'Live weather and solar prediction fetched');
});


export const getForecast = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await solarService.getForecastWithSolar(req.params['stationId'] as string);
  ApiResponse.success(res, data, 'Solar forecast fetched');
});


export const getStationAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const analytics = await solarService.getStationAnalytics(req.params['stationId'] as string);
  ApiResponse.success(res, analytics, 'Station analytics fetched');
});



export const getReports = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await solarService.getReports(
    req.query as unknown as ReportQuery,
    req.user ? { _id: req.user._id, role: req.user.role, roleLevel: req.user.roleLevel } : undefined,
  );
  ApiResponse.paginated(res, result.data, result.pagination, 'Reports fetched');
});


export const getReportById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const report = await solarService.getReportById(
    req.params['id'] as string,
    req.user ? { _id: req.user._id, role: req.user.role, roleLevel: req.user.roleLevel } : undefined,
  );
  ApiResponse.success(res, report);
});


export const createReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const report = await solarService.createReport(req.body as CreateReportDto, req.user!._id);
  ApiResponse.created(res, report, 'Solar report submitted successfully');
});


export const updateReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const report = await solarService.updateReport(
    req.params['id'] as string,
    req.body as UpdateReportDto,
    req.user!._id,
    req.user!.role,
    req.user!.roleLevel,
  );
  ApiResponse.success(res, report, 'Report updated');
});


export const deleteReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  await solarService.deleteReport(
    req.params['id'] as string,
    req.user!._id,
    req.user!.role,
    req.user!.roleLevel,
  );
  ApiResponse.noContent(res);
});


export const publishReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const report = await solarService.publishReport(
    req.params['id'] as string,
    req.user!._id,
    req.user!.role,
    req.user!.roleLevel,
  );
  ApiResponse.success(res, report, 'Report published');
});


export const archiveReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const report = await solarService.archiveReport(
    req.params['id'] as string,
    req.user!._id,
    req.user!.role,
    req.user!.roleLevel,
  );
  ApiResponse.success(res, report, 'Report archived');
});
