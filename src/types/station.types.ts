/**
 * Station TypeScript interfaces — Discriminator model (ChargingStation | SolarPanel).
 * Owner: Member 1 — expand fields when implementing station.model.ts.
 * Ref: PROJECT_OVERVIEW.md → Database → stations collection
 */

import { Document, Types } from 'mongoose';
import { GeoPoint } from './common.types';

// ─── Station status ──────────────────────────────────────────────────────────
export type StationStatus = 'pending' | 'approved' | 'rejected';

// ─── Station discriminator types ────────────────────────────────────────────
export type StationType = 'ChargingStation' | 'SolarPanel';

// ─── Embedded address ───────────────────────────────────────────────────────
export interface StationAddress {
  street?: string;
  city: string;
  district?: string;
  province?: string;
  country: string;
}

// ─── Operating hours ────────────────────────────────────────────────────────
export interface OperatingHours {
  open: string;  // e.g. "08:00"
  close: string; // e.g. "18:00"
  is24Hours: boolean;
}

// ─── Base station document ──────────────────────────────────────────────────
// TODO: Member 1 — add all fields here when implementing station.model.ts
export interface IStation extends Document {
  _id: Types.ObjectId;
  stationType: StationType;
  name: string;
  description?: string;
  address: StationAddress;
  location: GeoPoint;   // 2dsphere index
  status: StationStatus;
  isActive: boolean;
  isFeatured: boolean;
  averageRating: number;
  reviewCount: number;
  submittedBy: Types.ObjectId;  // ref: 'User'
  approvedBy?: Types.ObjectId;  // ref: 'User'
  rejectedBy?: Types.ObjectId;
  rejectionReason?: string;
  images?: string[];            // Cloudinary URLs
  operatingHours?: OperatingHours;
  createdAt: Date;
  updatedAt: Date;
}

// ─── DTOs ───────────────────────────────────────────────────────────────────
export interface CreateStationInput {
  name: string;
  description?: string;
  address: StationAddress;
  coordinates?: [number, number];
  stationType: StationType;
  operatingHours?: OperatingHours;
  // TODO: Member 1 — add connector types, amenities etc.
}

export interface UpdateStationInput extends Partial<CreateStationInput> {}

export interface RejectStationInput {
  rejectionReason: string;
}

export interface NearbyStationsQuery {
  lat: number;
  lng: number;
  radiusKm?: number;
  limit?: number;
}

export interface ListStationsQuery {
  page?: number;
  limit?: number;
  status?: StationStatus;
  city?: string;
  search?: string;
  // TODO: Member 1 — add additional filter fields
}
