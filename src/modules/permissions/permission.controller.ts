/**
 * Permission controller — thin HTTP layer for RBAC/ABAC management.
 *
 * TODO: Member 4 — uncomment service calls when PermissionService is implemented.
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Permissions (17 endpoints)
 */

import { Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import ApiResponse  from '@utils/ApiResponse';
import type { AuthRequest } from '@/types';
// import PermissionService from './permission.service';

export const listPermissions = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 4
  // const permissions = await PermissionService.listPermissions();
  // res.status(200).json(ApiResponse.success(permissions, 'Permissions fetched'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'listPermissions: not yet implemented'));
});

export const listRoles = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 4
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'listRoles: not yet implemented'));
});

export const getRolePermissions = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 4
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'getRolePermissions: not yet implemented'));
});

export const assignPermissionToRole = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 4
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'assignPermissionToRole: not yet implemented'));
});

export const removePermissionFromRole = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 4
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'removePermissionFromRole: not yet implemented'));
});

export const getUserEffectivePermissions = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 4
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'getUserEffectivePermissions: not yet implemented'));
});

export const overrideUserPermission = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 4
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'overrideUserPermission: not yet implemented'));
});

export const removeUserPermissionOverride = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 4
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'removeUserPermissionOverride: not yet implemented'));
});

export const checkPermission = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 4
  // const result = await PermissionService.checkPermission(req.user!._id.toString(), req.body.action, req.body.context);
  // res.status(200).json(ApiResponse.success(result, 'Permission evaluated'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'checkPermission: not yet implemented'));
});

export const listAuditLogs = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 4
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'listAuditLogs: not yet implemented'));
});

export const getQuotaStats = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // TODO: Member 4
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'getQuotaStats: not yet implemented'));
});
