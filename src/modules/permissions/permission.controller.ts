/**
 * Permission controller — thin HTTP layer for RBAC/ABAC management.
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Permissions (17 endpoints)
 *      MASTER_PROMPT.md → Controllers Must Be Thin — no business logic here
 */

import { Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import ApiResponse  from '@utils/ApiResponse';
import type { AuthRequest } from '@/types';
import PermissionService from './permission.service';

/**
 * @swagger
 * /api/permissions/admin/permissions:
 *   get:
 *     summary: List all 35 permission actions
 *     tags: [Permissions]
 *     security: [{ bearerAuth: [] }]
 *     x-permission: permissions.read
 *     responses:
 *       200:
 *         description: Permission list
 */
export const listPermissions = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const data = await PermissionService.listPermissions();
  return ApiResponse.success(res, data, 'Permissions fetched');
});

/**
 * @swagger
 * /api/permissions/admin/roles:
 *   get:
 *     summary: List all 10 roles
 *     tags: [Permissions]
 *     security: [{ bearerAuth: [] }]
 *     x-permission: permissions.read
 *     responses:
 *       200:
 *         description: Roles list
 */
export const listRoles = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const data = await PermissionService.listRoles();
  return ApiResponse.success(res, data, 'Roles fetched');
});

/**
 * @swagger
 * /api/permissions/admin/roles/{id}/permissions:
 *   get:
 *     summary: Get permissions assigned to a role
 *     tags: [Permissions]
 *     security: [{ bearerAuth: [] }]
 *     x-permission: permissions.read
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Role permissions
 */
export const getRolePermissions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await PermissionService.getRolePermissions(String(req.params.id));
  return ApiResponse.success(res, data, 'Role permissions fetched');
});

/**
 * @swagger
 * /api/permissions/admin/roles/{id}/permissions:
 *   post:
 *     summary: Assign a permission (+ policies) to a role
 *     tags: [Permissions]
 *     security: [{ bearerAuth: [] }]
 *     x-permission: permissions.manage
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: Permission assigned
 */
export const assignPermissionToRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { permissionId, policyIds } = req.body;
  const data = await PermissionService.assignPermissionToRole(String(req.params.id), permissionId, policyIds);
  return ApiResponse.created(res, data, 'Permission assigned to role');
});

/**
 * @swagger
 * /api/permissions/admin/roles/{id}/permissions/{permId}:
 *   delete:
 *     summary: Remove a permission from a role
 *     tags: [Permissions]
 *     security: [{ bearerAuth: [] }]
 *     x-permission: permissions.manage
 *     responses:
 *       204:
 *         description: Permission removed
 */
export const removePermissionFromRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  await PermissionService.removePermissionFromRole(String(req.params.id), String(req.params.permId));
  return ApiResponse.noContent(res);
});

/**
 * @swagger
 * /api/permissions/admin/users/{id}/permissions:
 *   get:
 *     summary: Get effective permissions for a user
 *     tags: [Permissions]
 *     security: [{ bearerAuth: [] }]
 *     x-permission: permissions.read
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Effective permissions
 */
export const getUserEffectivePermissions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await PermissionService.getUserEffectivePermissions(String(req.params.id));
  return ApiResponse.success(res, data, 'Effective permissions fetched');
});

/**
 * @swagger
 * /api/permissions/admin/users/{id}/permissions:
 *   post:
 *     summary: Override a permission for a user
 *     tags: [Permissions]
 *     security: [{ bearerAuth: [] }]
 *     x-permission: permissions.manage
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: Override created / updated
 */
export const overrideUserPermission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { permissionId, effect, reason, expiresAt } = req.body;
  const data = await PermissionService.overrideUserPermission(
    String(req.params.id), permissionId, effect, req.user!._id.toString(), reason, expiresAt,
  );
  return ApiResponse.created(res, data, 'Permission override saved');
});

/**
 * @swagger
 * /api/permissions/admin/users/{id}/permissions/{permId}:
 *   delete:
 *     summary: Remove a user permission override
 *     tags: [Permissions]
 *     security: [{ bearerAuth: [] }]
 *     x-permission: permissions.manage
 *     responses:
 *       204:
 *         description: Override removed
 */
export const removeUserPermissionOverride = asyncHandler(async (req: AuthRequest, res: Response) => {
  await PermissionService.removeUserPermissionOverride(String(req.params.id), String(req.params.permId), req.user!._id.toString());
  return ApiResponse.noContent(res);
});

/**
 * @swagger
 * /api/permissions/check:
 *   post:
 *     summary: Check if the current user has a given permission (frontend use)
 *     tags: [Permissions]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Evaluation result
 */
export const checkPermission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { action, context } = req.body;
  const result = await PermissionService.checkAccess(req.user!._id.toString(), action, context);
  return ApiResponse.success(res, result, 'Permission evaluated');
});

/**
 * @swagger
 * /api/permissions/admin/audit-logs:
 *   get:
 *     summary: Paginated audit trail
 *     tags: [Permissions]
 *     security: [{ bearerAuth: [] }]
 *     x-permission: audit.read
 *     responses:
 *       200:
 *         description: Audit logs
 */
export const listAuditLogs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await PermissionService.listAuditLogs(req.query as Record<string, unknown>);
  return ApiResponse.paginated(
    res,
    result.data,
    { page: result.page, limit: result.limit, total: result.total, totalPages: result.pages, hasNext: result.page < result.pages, hasPrev: result.page > 1 },
  );
});

/**
 * @swagger
 * /api/permissions/admin/quota:
 *   get:
 *     summary: Third-party API quota stats
 *     tags: [Permissions]
 *     security: [{ bearerAuth: [] }]
 *     x-permission: quotas.read
 *     responses:
 *       200:
 *         description: Quota statistics
 */
export const getQuotaStats = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const data = await PermissionService.getQuotaStats();
  return ApiResponse.success(res, data, 'Quota stats fetched');
});
