

import { Router }            from 'express';
import { protect }           from '@middleware/auth.middleware';
import { checkPermission }   from '@middleware/rbac.middleware';
import { validate }          from '@middleware/validate.middleware';
import * as PC               from './permission.controller';
import * as V                from './permission.validation';

const router = Router();

router.get('/admin/permissions',
  protect, checkPermission('permissions.read'), PC.listPermissions);

router.get('/admin/roles',
  protect, checkPermission('permissions.read'), PC.listRoles);

router.get('/admin/roles/:id/permissions',
  protect, checkPermission('permissions.read'), PC.getRolePermissions);

router.post('/admin/roles/:id/permissions',
  protect, checkPermission('permissions.manage'), validate(V.assignRolePermSchema), PC.assignPermissionToRole);

router.delete('/admin/roles/:id/permissions/:permId',
  protect, checkPermission('permissions.manage'), PC.removePermissionFromRole);

router.get('/admin/users/:id/permissions/matrix',
  protect, checkPermission('permissions.read'), PC.getUserPermissionMatrix);

router.get('/admin/users/:id/permissions',
  protect, checkPermission('permissions.read'), PC.getUserEffectivePermissions);

router.post('/admin/users/:id/permissions',
  protect, checkPermission('permissions.manage'), validate(V.overridePermSchema), PC.overrideUserPermission);

router.delete('/admin/users/:id/permissions/:permId',
  protect, checkPermission('permissions.manage'), PC.removeUserPermissionOverride);

router.post('/check',
  protect, validate(V.checkPermSchema), PC.checkPermission);

router.get('/admin/audit-logs',
  protect, checkPermission('audit.read'), PC.listAuditLogs);

router.get('/admin/quota',
  protect, checkPermission('quotas.read'), PC.getQuotaStats);

export default router;
