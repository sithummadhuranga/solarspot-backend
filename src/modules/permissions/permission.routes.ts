/**
 * Permission routes — 12 admin endpoints + 1 self-service check endpoint.
 *
 * Middleware order (MASTER_PROMPT): protect → checkPermission → validate → controller
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Permissions
 */

import { Router }            from 'express';
import { protect }           from '@middleware/auth.middleware';
import { checkPermission }   from '@middleware/rbac.middleware';
import { validate }          from '@middleware/validate.middleware';
import * as PC               from './permission.controller';
import * as V                from './permission.validation';

const router = Router();

// ─── Permissions catalog ──────────────────────────────────────────────────────
router.get('/admin/permissions',
  protect, checkPermission('permissions.read'), PC.listPermissions);

// ─── Roles ────────────────────────────────────────────────────────────────────
router.get('/admin/roles',
  protect, checkPermission('permissions.read'), PC.listRoles);

router.get('/admin/roles/:id/permissions',
  protect, checkPermission('permissions.read'), PC.getRolePermissions);

router.post('/admin/roles/:id/permissions',
  protect, checkPermission('permissions.manage'), validate(V.assignRolePermSchema), PC.assignPermissionToRole);

router.delete('/admin/roles/:id/permissions/:permId',
  protect, checkPermission('permissions.manage'), PC.removePermissionFromRole);

// ─── User overrides ───────────────────────────────────────────────────────────
router.get('/admin/users/:id/permissions',
  protect, checkPermission('permissions.read'), PC.getUserEffectivePermissions);

router.post('/admin/users/:id/permissions',
  protect, checkPermission('permissions.manage'), validate(V.overridePermSchema), PC.overrideUserPermission);

router.delete('/admin/users/:id/permissions/:permId',
  protect, checkPermission('permissions.manage'), PC.removeUserPermissionOverride);

// ─── Client-side permission gate ──────────────────────────────────────────────
router.post('/permissions/check',
  protect, validate(V.checkPermSchema), PC.checkPermission);

// ─── Audit logs ───────────────────────────────────────────────────────────────
router.get('/admin/audit-logs',
  protect, checkPermission('audit.read'), PC.listAuditLogs);

// ─── Quota stats ──────────────────────────────────────────────────────────────
router.get('/admin/quota',
  protect, checkPermission('quotas.read'), PC.getQuotaStats);

export default router;
