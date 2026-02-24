import { Request, Response } from 'express';
import PermissionsService from './permissions.service';
import ApiResponse from '@utils/ApiResponse';
import asyncHandler from '@middleware/asyncHandler';

/**
 * Permissions Controller
 * 
 * Handles HTTP requests for advanced PBAC system.
 */
class PermissionsController {
  // ================================
  // ROLES
  // ================================

  getAllRoles = asyncHandler(async (_req: Request, res: Response) => {
    const roles = await PermissionsService.getAllRoles();
    ApiResponse.success(res, roles, 'Roles retrieved successfully');
  });

  createRole = asyncHandler(async (req: Request, res: Response) => {
    const role = await PermissionsService.createRole(req.body);
    ApiResponse.created(res, role, 'Role created successfully');
  });

  updateRole = asyncHandler(async (req: Request, res: Response) => {
    const role = await PermissionsService.updateRole(req.params.id as string, req.body);
    ApiResponse.success(res, role, 'Role updated successfully');
  });

  deleteRole = asyncHandler(async (req: Request, res: Response) => {
    await PermissionsService.deleteRole(req.params.id as string);
    ApiResponse.success(res, null, 'Role deleted successfully');
  });

  // ================================
  // PERMISSIONS
  // ================================

  getAllPermissions = asyncHandler(async (_req: Request, res: Response) => {
    const permissions = await PermissionsService.getAllPermissions();
    ApiResponse.success(res, permissions, 'Permissions retrieved successfully');
  });

  createPermission = asyncHandler(async (req: Request, res: Response) => {
    const permission = await PermissionsService.createPermission(req.body);
    ApiResponse.created(res, permission, 'Permission created successfully');
  });

  // ================================
  // POLICIES
  // ================================

  getAllPolicies = asyncHandler(async (_req: Request, res: Response) => {
    const policies = await PermissionsService.getAllPolicies();
    ApiResponse.success(res, policies, 'Policies retrieved successfully');
  });

  createPolicy = asyncHandler(async (req: Request, res: Response) => {
    const policy = await PermissionsService.createPolicy(req.body);
    ApiResponse.created(res, policy, 'Policy created successfully');
  });

  updatePolicy = asyncHandler(async (req: Request, res: Response) => {
    const policy = await PermissionsService.updatePolicy(req.params.id as string, req.body);
    ApiResponse.success(res, policy, 'Policy updated successfully');
  });

  // ================================
  // POLICY ATTACHMENT
  // ================================

  attachPolicy = asyncHandler(async (req: Request, res: Response) => {
    const { roleId, permissionId } = req.params;
    const { policyId } = req.body;

    const rolePermission = await PermissionsService.attachPolicyToRolePermission(
      roleId as string,
      permissionId as string,
      policyId
    );

    ApiResponse.success(res, rolePermission, 'Policy attached successfully');
  });

  detachPolicy = asyncHandler(async (req: Request, res: Response) => {
    const { roleId, permissionId, policyId } = req.params;

    const rolePermission = await PermissionsService.detachPolicyFromRolePermission(
      roleId as string,
      permissionId as string,
      policyId as string
    );

    ApiResponse.success(res, rolePermission, 'Policy detached successfully');
  });

  // ================================
  // USER OVERRIDES
  // ================================

  getUserOverrides = asyncHandler(async (req: Request, res: Response) => {
    const overrides = await PermissionsService.getUserOverrides(req.params.userId as string);
    ApiResponse.success(res, overrides, 'User overrides retrieved successfully');
  });

  createUserOverride = asyncHandler(async (req: Request, res: Response) => {
    const override = await PermissionsService.createUserOverride({
      ...req.body,
      userId: req.params.userId as string,
      grantedById: req.user!._id.toString(),
    });

    ApiResponse.created(res, override, 'User override created successfully');
  });

  deleteUserOverride = asyncHandler(async (req: Request, res: Response) => {
    await PermissionsService.deleteUserOverride(
      req.params.overrideId as string,
      req.user!._id.toString()
    );

    ApiResponse.success(res, null, 'User override deleted successfully');
  });

  // ================================
  // AUDIT LOGS
  // ================================

  getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
    const logs = await PermissionsService.getAuditLogs(req.query);
    ApiResponse.success(res, logs, 'Audit logs retrieved successfully');
  });

  // ================================
  // NOTIFICATIONS
  // ================================

  getUserNotifications = asyncHandler(async (req: Request, res: Response) => {
    const notifications = await PermissionsService.getUserNotifications(
      req.user!._id.toString(),
      req.query.unreadOnly === 'true'
    );

    ApiResponse.success(res, notifications, 'Notifications retrieved successfully');
  });

  markNotificationAsRead = asyncHandler(async (req: Request, res: Response) => {
    const notification = await PermissionsService.markNotificationAsRead(
      req.params.id as string,
      req.user!._id.toString()
    );

    ApiResponse.success(res, notification, 'Notification marked as read');
  });

  // ================================
  // CACHE MANAGEMENT
  // ================================

  reloadPermissions = asyncHandler(async (_req: Request, res: Response) => {
    const result = await PermissionsService.reloadPermissions();
    ApiResponse.success(res, result, 'Permissions reloaded successfully');
  });
}

export default new PermissionsController();
