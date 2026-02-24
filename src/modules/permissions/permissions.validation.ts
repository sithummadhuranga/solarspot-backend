import Joi from 'joi';

/**
 * Permission Module Validation Schemas
 */

// ================================
// ROLES
// ================================

export const createRoleSchema = Joi.object({
  name: Joi.string()
    .lowercase()
    .pattern(/^[a-z_]+$/)
    .min(3)
    .max(50)
    .required()
    .messages({
      'string.pattern.base': 'Role name must contain only lowercase letters and underscores',
    }),
  displayName: Joi.string().min(3).max(100).required(),
  description: Joi.string().max(500).required(),
  roleLevel: Joi.number().integer().min(0).max(4).required(),
  component: Joi.string().valid('auth', 'stations', 'reviews', 'weather', 'system').required(),
});

export const updateRoleSchema = Joi.object({
  displayName: Joi.string().min(3).max(100),
  description: Joi.string().max(500),
}).min(1);

export const roleIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

// ================================
// PERMISSIONS
// ================================

export const createPermissionSchema = Joi.object({
  action: Joi.string()
    .pattern(/^[a-z]+\.[a-z_]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Action must be in format: resource.action (e.g., stations.create)',
    }),
  resource: Joi.string().lowercase().min(3).max(50).required(),
  component: Joi.string().valid('auth', 'stations', 'reviews', 'weather', 'system').required(),
  description: Joi.string().max(500).required(),
});

// ================================
// POLICIES
// ================================

export const createPolicySchema = Joi.object({
  name: Joi.string()
    .lowercase()
    .pattern(/^[a-z_]+$/)
    .min(3)
    .max(100)
    .required(),
  displayName: Joi.string().min(3).max(100).required(),
  description: Joi.string().max(500).required(),
  condition: Joi.object({
    type: Joi.string()
      .valid(
        'email_verified',
        'account_active',
        'owner_match',
        'unique_review',
        'no_self_vote',
        'time_window',
        'role_minimum',
        'field_equals',
        'ownership_check'
      )
      .required(),
  }).required(),
  effect: Joi.string().valid('allow', 'deny').required(),
  config: Joi.object().optional(),
});

export const updatePolicySchema = Joi.object({
  displayName: Joi.string().min(3).max(100),
  description: Joi.string().max(500),
  config: Joi.object(),
}).min(1);

export const policyIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

// ================================
// POLICY ATTACHMENT
// ================================

export const attachPolicySchema = Joi.object({
  policyId: Joi.string().hex().length(24).required(),
});

export const rolePermissionPolicyParamsSchema = Joi.object({
  roleId: Joi.string().hex().length(24).required(),
  permissionId: Joi.string().hex().length(24).required(),
  policyId: Joi.string().hex().length(24).required(),
});

// ================================
// USER OVERRIDES
// ================================

export const createUserOverrideSchema = Joi.object({
  permissionId: Joi.string().hex().length(24).required(),
  effect: Joi.string().valid('grant', 'deny').required(),
  reason: Joi.string().min(10).max(500).required(),
  expiresAt: Joi.date().greater('now').optional(),
});

export const userIdParamSchema = Joi.object({
  userId: Joi.string().hex().length(24).required(),
});

export const overrideIdParamSchema = Joi.object({
  overrideId: Joi.string().hex().length(24).required(),
});

// ================================
// AUDIT LOGS
// ================================

export const getAuditLogsQuerySchema = Joi.object({
  userId: Joi.string().hex().length(24).optional(),
  action: Joi.string().max(100).optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  limit: Joi.number().integer().min(1).max(1000).default(100),
});

// ================================
// NOTIFICATIONS
// ================================

export const getNotificationsQuerySchema = Joi.object({
  unreadOnly: Joi.boolean().default(false),
});

export const notificationIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});
