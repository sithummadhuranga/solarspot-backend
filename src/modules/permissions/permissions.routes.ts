import { Router } from 'express';
import PermissionsController from './permissions.controller';
import { protect } from '@middleware/auth.middleware';
import { checkPermission, flushAllCache } from '@middleware/rbac.middleware';
import { validate } from '@middleware/validate.middleware';
import * as v from './permissions.validation';

const router = Router();

/**
 * Permissions Module Routes
 * 
 * 17 Endpoints for Advanced PBAC:
 * - Roles (4): list, create, update, delete
 * - Permissions (2): list, create
 * - Policies (3): list, create, update
 * - Policy Attachment (2): attach, detach
 * - User Overrides (3): list, create, delete
 * - Audit Logs (1): list
 * - Notifications (2): list, mark read
 * - Cache (1): reload
 */

// ================================
// ROLES (4 endpoints)
// ================================

/**
 * @swagger
 * /api/permissions/roles:
 *   get:
 *     summary: Get all roles
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.view_roles
 *     x-rbac-resource: Role
 *     x-component: permissions
 *     responses:
 *       200:
 *         description: Roles retrieved successfully
 */
router.get(
  '/roles',
  protect,
  checkPermission('system.view_roles'),
  PermissionsController.getAllRoles
);

/**
 * @swagger
 * /api/permissions/roles:
 *   post:
 *     summary: Create a new role
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.manage_roles
 *     x-rbac-resource: Role
 *     x-component: permissions
 *     responses:
 *       201:
 *         description: Role created successfully
 */
router.post(
  '/roles',
  protect,
  checkPermission('system.manage_roles'),
  validate(v.createRoleSchema),
  PermissionsController.createRole
);

/**
 * @swagger
 * /api/permissions/roles/{id}:
 *   put:
 *     summary: Update a role
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.manage_roles
 *     responses:
 *       200:
 *         description: Role updated successfully
 */
router.put(
  '/roles/:id',
  protect,
  checkPermission('system.manage_roles'),
  validate(v.updateRoleSchema),
  validate(v.roleIdParamSchema, 'params'),
  PermissionsController.updateRole
);

/**
 * @swagger
 * /api/permissions/roles/{id}:
 *   delete:
 *     summary: Delete a role
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.manage_roles
 *     responses:
 *       200:
 *         description: Role deleted successfully
 */
router.delete(
  '/roles/:id',
  protect,
  checkPermission('system.manage_roles'),
  validate(v.roleIdParamSchema, 'params'),
  PermissionsController.deleteRole
);

// ================================
// PERMISSIONS (2 endpoints)
// ================================

/**
 * @swagger
 * /api/permissions:
 *   get:
 *     summary: Get all permissions
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.view_permissions
 *     responses:
 *       200:
 *         description: Permissions retrieved successfully
 */
router.get(
  '/',
  protect,
  checkPermission('system.view_permissions'),
  PermissionsController.getAllPermissions
);

/**
 * @swagger
 * /api/permissions:
 *   post:
 *     summary: Create a new permission
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.manage_permissions
 *     responses:
 *       201:
 *         description: Permission created successfully
 */
router.post(
  '/',
  protect,
  checkPermission('system.manage_permissions'),
  validate(v.createPermissionSchema),
  PermissionsController.createPermission
);

// ================================
// POLICIES (3 endpoints)
// ================================

/**
 * @swagger
 * /api/permissions/policies:
 *   get:
 *     summary: Get all policies
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.view_policies
 *     responses:
 *       200:
 *         description: Policies retrieved successfully
 */
router.get(
  '/policies',
  protect,
  checkPermission('system.view_policies'),
  PermissionsController.getAllPolicies
);

/**
 * @swagger
 * /api/permissions/policies:
 *   post:
 *     summary: Create a new policy
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.manage_policies
 *     responses:
 *       201:
 *         description: Policy created successfully
 */
router.post(
  '/policies',
  protect,
  checkPermission('system.manage_policies'),
  validate(v.createPolicySchema),
  PermissionsController.createPolicy
);

/**
 * @swagger
 * /api/permissions/policies/{id}:
 *   put:
 *     summary: Update a policy
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.manage_policies
 *     responses:
 *       200:
 *         description: Policy updated successfully
 */
router.put(
  '/policies/:id',
  protect,
  checkPermission('system.manage_policies'),
  validate(v.updatePolicySchema),
  validate(v.policyIdParamSchema, 'params'),
  PermissionsController.updatePolicy
);

// ================================
// POLICY ATTACHMENT (2 endpoints)
// ================================

/**
 * @swagger
 * /api/permissions/roles/{roleId}/permissions/{permissionId}/policies:
 *   post:
 *     summary: Attach a policy to a role-permission mapping
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.manage_policies
 *     responses:
 *       200:
 *         description: Policy attached successfully
 */
router.post(
  '/roles/:roleId/permissions/:permissionId/policies',
  protect,
  checkPermission('system.manage_policies'),
  validate(v.attachPolicySchema),
  PermissionsController.attachPolicy,
  flushAllCache
);

/**
 * @swagger
 * /api/permissions/roles/{roleId}/permissions/{permissionId}/policies/{policyId}:
 *   delete:
 *     summary: Detach a policy from a role-permission mapping
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.manage_policies
 *     responses:
 *       200:
 *         description: Policy detached successfully
 */
router.delete(
  '/roles/:roleId/permissions/:permissionId/policies/:policyId',
  protect,
  checkPermission('system.manage_policies'),
  validate(v.rolePermissionPolicyParamsSchema, 'params'),
  PermissionsController.detachPolicy,
  flushAllCache
);

// ================================
// USER OVERRIDES (3 endpoints)
// ================================

/**
 * @swagger
 * /api/permissions/users/{userId}/overrides:
 *   get:
 *     summary: Get user permission overrides
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.view_user_overrides
 *     responses:
 *       200:
 *         description: User overrides retrieved successfully
 */
router.get(
  '/users/:userId/overrides',
  protect,
  checkPermission('system.view_user_overrides'),
  validate(v.userIdParamSchema, 'params'),
  PermissionsController.getUserOverrides
);

/**
 * @swagger
 * /api/permissions/users/{userId}/overrides:
 *   post:
 *     summary: Create a user permission override
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.manage_user_overrides
 *     responses:
 *       201:
 *         description: User override created successfully
 */
router.post(
  '/users/:userId/overrides',
  protect,
  checkPermission('system.manage_user_overrides'),
  validate(v.createUserOverrideSchema),
  validate(v.userIdParamSchema, 'params'),
  PermissionsController.createUserOverride
);

/**
 * @swagger
 * /api/permissions/users/{userId}/overrides/{overrideId}:
 *   delete:
 *     summary: Delete a user permission override
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.manage_user_overrides
 *     responses:
 *       200:
 *         description: User override deleted successfully
 */
router.delete(
  '/users/:userId/overrides/:overrideId',
  protect,
  checkPermission('system.manage_user_overrides'),
  validate(v.overrideIdParamSchema, 'params'),
  PermissionsController.deleteUserOverride
);

// ================================
// AUDIT LOGS (1 endpoint)
// ================================

/**
 * @swagger
 * /api/permissions/audit:
 *   get:
 *     summary: Get audit logs
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.view_audit_logs
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 */
router.get(
  '/audit',
  protect,
  checkPermission('system.view_audit_logs'),
  validate(v.getAuditLogsQuerySchema, 'query'),
  PermissionsController.getAuditLogs
);

// ================================
// NOTIFICATIONS (2 endpoints)
// ================================

/**
 * @swagger
 * /api/permissions/notifications:
 *   get:
 *     summary: Get user notifications
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 */
router.get(
  '/notifications',
  protect,
  validate(v.getNotificationsQuerySchema, 'query'),
  PermissionsController.getUserNotifications
);

/**
 * @swagger
 * /api/permissions/notifications/{id}/read:
 *   patch:
 *     summary: Mark notification as read
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification marked as read
 */
router.patch(
  '/notifications/:id/read',
  protect,
  validate(v.notificationIdParamSchema, 'params'),
  PermissionsController.markNotificationAsRead
);

// ================================
// CACHE MANAGEMENT (1 endpoint)
// ================================

/**
 * @swagger
 * /api/permissions/reload:
 *   post:
 *     summary: Reload all permission caches
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.reload_permissions
 *     responses:
 *       200:
 *         description: Permissions reloaded successfully
 */
router.post(
  '/reload',
  protect,
  checkPermission('system.reload_permissions'),
  PermissionsController.reloadPermissions,
  flushAllCache
);

export default router;
