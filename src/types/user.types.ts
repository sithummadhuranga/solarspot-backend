/**
 * User & Auth TypeScript interfaces.
 * Owner: Member 4 — expand fields when implementing the model.
 * Ref: PROJECT_OVERVIEW.md → Database → users collection
 */

import { Document, Types } from 'mongoose';

// ─── Role slugs ─────────────────────────────────────────────────────────────
// Ref: PROJECT_OVERVIEW.md → Roles — 10 Total
export type RoleSlug =
  | 'guest'
  | 'user'
  | 'station_owner'
  | 'featured_contributor'
  | 'trusted_reviewer'
  | 'review_moderator'
  | 'weather_analyst'
  | 'permission_auditor'
  | 'moderator'
  | 'admin';

// ─── User document ──────────────────────────────────────────────────────────
export interface IUser extends Document {
  _id: Types.ObjectId;
  displayName: string;
  email: string;
  password: string;             // select: false
  role: Types.ObjectId | IRole; // ref: 'Role'
  bio?: string;                 // max 500 chars
  avatarUrl?: string;           // Cloudinary URL
  isActive: boolean;
  isEmailVerified: boolean;
  isBanned: boolean;
  emailVerifyToken?: string;    // select: false, sparse index
  emailVerifyExpires?: Date;    // select: false
  passwordResetToken?: string;  // select: false, sparse index
  passwordResetExpires?: Date;  // select: false
  refreshToken?: string;        // select: false, sparse index
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;   // ref: 'User'
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
}

// ─── Role document ──────────────────────────────────────────────────────────
export interface IRole extends Document {
  _id: Types.ObjectId;
  name: RoleSlug;
  displayName: string;
  roleLevel: number;   // 0–4
  isSystem: boolean;   // system roles cannot be deleted
  isActive: boolean;
}

// ─── DTOs ───────────────────────────────────────────────────────────────────
export interface CreateUserInput {
  displayName: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  displayName?: string; // 2–80 chars
  bio?: string;         // max 500 chars
  avatarUrl?: string;   // Cloudinary URL
}

export interface AdminUpdateUserInput {
  role?: string;        // role name slug
  isActive?: boolean;
  isBanned?: boolean;
}
