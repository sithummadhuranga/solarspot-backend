/**
 * Station TypeScript interfaces.
 * Owner: Member 1
 * Ref: PROJECT_OVERVIEW.md → Database → stations collection
 */

import { Document, Types } from 'mongoose';

// ─── Station status ──────────────────────────────────────────────────────────
export type StationStatus = 'pending' | 'active' | 'inactive' | 'rejected';

// ─── Connector types ─────────────────────────────────────────────────────────
export type ConnectorType = 'USB-C' | 'Type-2' | 'CCS' | 'CHAdeMO' | 'Tesla-NACS' | 'AC-Socket';

// ─── Amenity values ──────────────────────────────────────────────────────────
export type AmenityValue =
  | 'wifi' | 'cafe' | 'restroom' | 'parking' | 'security'
  | 'shade' | 'water' | 'repair_shop' | 'ev_parking';

// ─── Sub-document interfaces ─────────────────────────────────────────────────
export interface IConnector {
  type: ConnectorType;
  powerKw: number;
  count: number;
}

export interface IScheduleEntry {
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  openTime: string;  // HH:MM
  closeTime: string; // HH:MM
}

export interface IOperatingHours {
  alwaysOpen: boolean;
  schedule: IScheduleEntry[];
}

export interface IStationAddress {
  street: string | null;
  city: string | null;
  district: string | null;
  country: string | null;
  postalCode: string | null;
  formattedAddress: string | null;
}

export interface IGeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

// ─── Station document ────────────────────────────────────────────────────────
export interface IStation extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  location?: IGeoPoint | null;
  geocodePending: boolean;
  address: IStationAddress;
  submittedBy: Types.ObjectId;
  connectors: IConnector[];
  solarPanelKw: number;
  amenities: AmenityValue[];
  images: string[];
  operatingHours: IOperatingHours;
  status: StationStatus;
  isVerified: boolean;
  verifiedBy: Types.ObjectId | null;
  verifiedAt: Date | null;
  rejectionReason: string | null;
  isFeatured: boolean;
  averageRating: number;
  reviewCount: number;
  isActive: boolean;
  deletedAt: Date | null;
  deletedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── DTOs ───────────────────────────────────────────────────────────────────
export interface CreateStationInput {
  name: string;
  description?: string;
  addressString?: string;
  lat?: number;
  lng?: number;
  connectors: IConnector[];
  solarPanelKw: number;
  amenities?: AmenityValue[];
  images?: string[];
  operatingHours?: IOperatingHours;
}

export type UpdateStationInput = Partial<CreateStationInput>;

export interface RejectStationInput {
  rejectionReason: string;
}

export interface NearbyStationsQuery {
  lat: number;
  lng: number;
  radius?: number; // km
  limit?: number;
}

export interface ListStationsQuery {
  page?: number;
  limit?: number;
  search?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  connectorType?: ConnectorType;
  minRating?: number;
  isVerified?: boolean;
  amenities?: string | string[];
  sortBy?: 'newest' | 'rating' | 'distance' | 'featured';
}

// PaginationResult is defined in common.types.ts — do not duplicate here
