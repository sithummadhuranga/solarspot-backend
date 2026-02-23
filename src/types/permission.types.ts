/**
 * Permission system TypeScript interfaces — RBAC engine.
 * Owner: Member 4 — implement in permissions module.
 * Ref: PROJECT_OVERVIEW.md → Permissions — 35 Actions
 *      PROJECT_OVERVIEW.md → Policies — 13 Built-in
 *      PROJECT_OVERVIEW.md → Database → Permission Collections
 */

import { Document, Types } from 'mongoose';

// ─── Permission action strings ───────────────────────────────────────────────
// Ref: PROJECT_OVERVIEW.md → Permissions — 35 Actions
export type PermissionAction =
  // Stations (Member 1)
  | 'stations.read' | 'stations.read-pending' | 'stations.create'
  | 'stations.edit-own' | 'stations.delete-own' | 'stations.edit-any'
  | 'stations.delete-any' | 'stations.approve' | 'stations.reject'
  | 'stations.feature' | 'stations.feature-request' | 'stations.view-stats-own'
  // Reviews (Member 2)
  | 'reviews.read' | 'reviews.read-flagged' | 'reviews.create'
  | 'reviews.edit-own' | 'reviews.delete-own' | 'reviews.delete-any'
  | 'reviews.helpful' | 'reviews.flag' | 'reviews.moderate'
  // Weather (Member 3)
  | 'weather.read' | 'weather.admin' | 'weather.bulk-refresh' | 'weather.export'
  // Users & Auth (Member 4)
  | 'users.read-public' | 'users.read-own' | 'users.edit-own'
  | 'users.read-list' | 'users.manage'
  // System (Member 4)
  | 'permissions.read' | 'permissions.manage' | 'quotas.read'
  | 'audit.read' | 'notifications.read-own';

// ─── Policy condition slugs ─────────────────────────────────────────────────
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

// ─── Permission document ─────────────────────────────────────────────────────
export interface IPermission extends Document {
  _id: Types.ObjectId;
  action: PermissionAction;
  resource: string;          // e.g. 'stations', 'reviews'
  component: string;         // module name e.g. 'stations'
  description: string;
}

// ─── Policy document ────────────────────────────────────────────────────────
export interface IPolicy extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  condition: PolicyCondition;
  effect: 'allow' | 'deny';
  config?: Record<string, unknown>; // condition-specific config
  isSystem: boolean;
}

// ─── Role-permission join ────────────────────────────────────────────────────
export interface IRolePermission extends Document {
  _id: Types.ObjectId;
  role: Types.ObjectId;        // ref: 'Role'
  permission: Types.ObjectId;  // ref: 'Permission'
  policies: Types.ObjectId[];  // ref: 'Policy'[]
}

// ─── Per-user permission override ───────────────────────────────────────────
export interface IUserPermissionOverride extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;        // ref: 'User'
  permission: Types.ObjectId;  // ref: 'Permission'
  effect: 'grant' | 'deny';
  reason?: string;
  grantedBy: Types.ObjectId;   // ref: 'User'
  expiresAt?: Date;
}

// ─── Audit log document ─────────────────────────────────────────────────────
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

// ─── Permission engine result ────────────────────────────────────────────────
export interface EvaluationResult {
  allowed: boolean;
  reason?: string;
  policy?: string;   // which policy caused allow/deny
}
