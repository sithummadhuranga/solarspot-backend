

import { Document, Types } from 'mongoose';

export type PermissionAction =
  | 'stations.read' | 'stations.read-pending' | 'stations.create'
  | 'stations.edit-own' | 'stations.delete-own' | 'stations.edit-any'
  | 'stations.delete-any' | 'stations.approve' | 'stations.reject'
  | 'stations.feature' | 'stations.feature-request' | 'stations.view-stats-own'
  | 'reviews.read' | 'reviews.read-flagged' | 'reviews.create'
  | 'reviews.edit-own' | 'reviews.delete-own' | 'reviews.delete-any'
  | 'reviews.helpful' | 'reviews.flag' | 'reviews.moderate'
  | 'weather.read' | 'weather.admin' | 'weather.bulk-refresh' | 'weather.export'
  | 'users.read-public' | 'users.read-own' | 'users.edit-own'
  | 'users.read-list' | 'users.manage'
  | 'permissions.read' | 'permissions.manage' | 'quotas.read'
  | 'audit.read' | 'notifications.read-own';

export type PolicyCondition =
  | 'email_verified'
  | 'account_active'
  | 'checkBanned'
  | 'owner_match'
  | 'unique_review'
  | 'ownership_check'
  | 'no_self_vote'
  | 'time_window'
  | 'role_minimum'
  | 'field_equals';

export interface IPermission extends Document {
  _id: Types.ObjectId;
  action: PermissionAction;
  resource: string;          // e.g. 'stations', 'reviews'
  component: string;         // module name e.g. 'stations'
  description: string;
}

export interface IPolicy extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  condition: PolicyCondition;
  effect: 'allow' | 'deny';
  config?: Record<string, unknown>; // condition-specific config
  isSystem: boolean;
}

export interface IRolePermission extends Document {
  _id: Types.ObjectId;
  role: Types.ObjectId;        // ref: 'Role'
  permission: Types.ObjectId;  // ref: 'Permission'
  policies: Types.ObjectId[];  // ref: 'Policy'[]
}

export interface IUserPermissionOverride extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;        // ref: 'User'
  permission: Types.ObjectId;  // ref: 'Permission'
  effect: 'grant' | 'deny';
  reason?: string;
  grantedBy: Types.ObjectId;   // ref: 'User'
  expiresAt?: Date;
}

export interface IUserPermissionMatrixItem {
  permission: IPermission;
  allowed: boolean;
  roleGranted: boolean;
  source: 'role' | 'override-grant' | 'override-deny' | 'none';
  overrideEffect: 'grant' | 'deny' | null;
  overrideReason?: string | null;
  overrideExpiresAt?: Date | null;
}

export interface IAuditLog extends Document {
  _id: Types.ObjectId;
  actor: Types.ObjectId;       // ref: 'User'
  action: string;
  resource: string;
  resourceId?: Types.ObjectId;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;             // TTL index: 90 days
}

export interface EvaluationResult {
  allowed: boolean;
  reason?: string;
  policy?: string;   // which policy caused allow/deny
}
