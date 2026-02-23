/**
 * Permission routes — 17 endpoints.
 *
 * TODO: Member 4 — uncomment route registrations.
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Permissions
 *      MASTER_PROMPT.md → Route Middleware Order: protect → checkPermission → validate → controller
 */

import { Router } from 'express';
// import { protect }               from '@middleware/auth.middleware';
// import { checkPermission }       from '@middleware/rbac.middleware';
// import { validate }              from '@middleware/validate.middleware';
// import * as PermController       from './permission.controller';
// import * as V                    from './permission.validation';

const router = Router();

// ─── Permissions catalog ─────────────────────────────────────────────────────
// router.get('/permissions',      protect, checkPermission('permissions.list'), PermController.listPermissions);

// ─── Roles ────────────────────────────────────────────────────────────────────
// router.get('/roles',            protect, checkPermission('permissions.list'),   PermController.listRoles);
// router.get('/roles/:id/permissions', protect, checkPermission('permissions.list'), PermController.getRolePermissions);
// router.post('/roles/:id/permissions',    protect, checkPermission('permissions.assign'), validate(V.assignRolePermSchema), PermController.assignPermissionToRole);
// router.delete('/roles/:id/permissions/:permId', protect, checkPermission('permissions.revoke'), PermController.removePermissionFromRole);

// ─── User overrides ───────────────────────────────────────────────────────────
// router.get('/users/:id/permissions',           protect, checkPermission('permissions.list'),   PermController.getUserEffectivePermissions);
// router.post('/users/:id/permissions',           protect, checkPermission('permissions.assign'), validate(V.overridePermSchema),   PermController.overrideUserPermission);
// router.delete('/users/:id/permissions/:permId', protect, checkPermission('permissions.revoke'), PermController.removeUserPermissionOverride);

// ─── Check (client-side permission gate) ──────────────────────────────────────
// router.post('/permissions/check', protect, validate(V.checkPermSchema), PermController.checkPermission);

// ─── Audit + Quota ────────────────────────────────────────────────────────────
// router.get('/audit-logs', protect, checkPermission('permissions.list'), PermController.listAuditLogs);
// router.get('/quota',      protect, checkPermission('permissions.list'), PermController.getQuotaStats);

export default router;
