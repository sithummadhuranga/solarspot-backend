/**
 * Common / shared TypeScript types used across all modules.
 * Ref: PROJECT_OVERVIEW.md → Standard Response Envelope
 */

import { Request } from 'express';
import { Types } from 'mongoose';

// ─── Auth-enriched Request ──────────────────────────────────────────────────
// auth.middleware.ts augments Express.Request.user globally — use that augmentation
// directly. AuthRequest is a plain alias so controllers can document intent clearly.
export type AuthRequest = Request;

// Minimal user shape passed through the request — populated by auth middleware.
// Must stay compatible with the global augmentation in auth.middleware.ts.
// Full IUser lives in the users module.
export interface IUserForAuth {
  _id: string;
  email: string;
  role: 'user' | 'moderator' | 'admin';
  isEmailVerified: boolean;
}

// ─── Minimal interfaces for cross-module use ────────────────────────────────
// ISP: pass only what each service actually needs, not the full document.

export interface IUserForPermission {
  _id: Types.ObjectId;
  role: string;
  roleLevel: number;
  isEmailVerified: boolean;
  isActive: boolean;
  isBanned?: boolean;
}

export interface IUserForEmail {
  _id: Types.ObjectId;
  displayName: string;
  email: string;
}

// ─── Pagination ─────────────────────────────────────────────────────────────
export interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

// ─── Third-party service names (for QuotaService) ──────────────────────────
export type ThirdPartyService =
  | 'openweathermap'
  | 'perspective'
  | 'nominatim'
  | 'cloudinary'
  | 'brevo';

// ─── Geocoordinates ─────────────────────────────────────────────────────────
export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface Coordinates {
  lat: number;
  lng: number;
}
