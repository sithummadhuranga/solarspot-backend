

import { Request } from 'express';
import { Types } from 'mongoose';

export type AuthRequest = Request;

export interface IUserForAuth {
  _id: string;
  email: string;
  role: 'user' | 'moderator' | 'admin';
  isEmailVerified: boolean;
}


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

export type ThirdPartyService =
  | 'openweathermap'
  | 'perspective'
  | 'nominatim'
  | 'cloudinary'
  | 'brevo'
  | 'huggingface';

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface Coordinates {
  lat: number;
  lng: number;
}
