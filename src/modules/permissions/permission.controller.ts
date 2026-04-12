

import { Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import ApiResponse  from '@utils/ApiResponse';
import type { AuthRequest } from '@/types';
import PermissionService from './permission.service';


export const listPermissions = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const data = await PermissionService.listPermissions();
  return ApiResponse.success(res, data, 'Permissions fetched');
});


export const listRoles = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const data = await PermissionService.listRoles();
  return ApiResponse.success(res, data, 'Roles fetched');
});


export const getRolePermissions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await PermissionService.getRolePermissions(String(req.params.id));
  return ApiResponse.success(res, data, 'Role permissions fetched');
});


export const assignPermissionToRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { permissionId, policyIds } = req.body;
  const data = await PermissionService.assignPermissionToRole(String(req.params.id), permissionId, policyIds);
  return ApiResponse.created(res, data, 'Permission assigned to role');
});


export const removePermissionFromRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  await PermissionService.removePermissionFromRole(String(req.params.id), String(req.params.permId));
  return ApiResponse.noContent(res);
});


export const getUserEffectivePermissions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await PermissionService.getUserEffectivePermissions(String(req.params.id));
  return ApiResponse.success(res, data, 'Effective permissions fetched');
});


export const getUserPermissionMatrix = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await PermissionService.getUserPermissionMatrix(String(req.params.id));
  return ApiResponse.success(res, data, 'User permission matrix fetched');
});


export const overrideUserPermission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { permissionId, effect, reason, expiresAt } = req.body;
  const data = await PermissionService.overrideUserPermission(
    String(req.params.id), permissionId, effect, req.user!._id.toString(), reason, expiresAt,
  );
  return ApiResponse.created(res, data, 'Permission override saved');
});


export const removeUserPermissionOverride = asyncHandler(async (req: AuthRequest, res: Response) => {
  await PermissionService.removeUserPermissionOverride(String(req.params.id), String(req.params.permId), req.user!._id.toString());
  return ApiResponse.noContent(res);
});


export const checkPermission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { action, context } = req.body;
  const result = await PermissionService.checkAccess(req.user!._id.toString(), action, context);
  return ApiResponse.success(res, result, 'Permission evaluated');
});


export const listAuditLogs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await PermissionService.listAuditLogs(req.query as Record<string, unknown>);
  return ApiResponse.paginated(
    res,
    result.data,
    { page: result.page, limit: result.limit, total: result.total, totalPages: result.pages, hasNext: result.page < result.pages, hasPrev: result.page > 1 },
  );
});


export const getQuotaStats = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const data = await PermissionService.getQuotaStats();
  return ApiResponse.success(res, data, 'Quota stats fetched');
});
