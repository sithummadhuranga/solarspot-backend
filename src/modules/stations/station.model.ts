import mongoose, {
  Schema,
  Document,
  Model,
  Types,
} from 'mongoose';

// ─── Sub-document Interfaces ──────────────────────────────────────────────────

export interface IConnector {
  type: 'USB-C' | 'Type-2' | 'CCS' | 'CHAdeMO' | 'Tesla-NACS' | 'AC-Socket';
  powerKw: number;
  count: number;
}

export interface IScheduleEntry {
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  openTime: string;
  closeTime: string;
}

export interface IOperatingHours {
  alwaysOpen: boolean;
  schedule: IScheduleEntry[];
}

export interface IAddress {
  street: string | null;
  city: string | null;
  district: string | null;
  country: string | null;
  postalCode: string | null;
  formattedAddress: string | null;
}

export interface IGeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

// ─── Main Document Interface ──────────────────────────────────────────────────

export interface IStation extends Document {
  name: string;
  description?: string;
  // location is null when geocodePending is true and coordinates haven't been resolved yet
  location?: IGeoPoint | null;
  geocodePending: boolean;
  address: IAddress;
  submittedBy: Types.ObjectId;
  connectors: IConnector[];
  solarPanelKw: number;
  amenities: string[];
  images: string[];
  operatingHours: IOperatingHours;
  status: 'pending' | 'active' | 'inactive' | 'rejected';
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

// ─── Connector types & amenities (shared with validation layer) ───────────────

export const CONNECTOR_TYPES = [
  'USB-C',
  'Type-2',
  'CCS',
  'CHAdeMO',
  'Tesla-NACS',
  'AC-Socket',
] as const;

export const AMENITY_VALUES = [
  'wifi',
  'cafe',
  'restroom',
  'parking',
  'security',
  'shade',
  'water',
  'repair_shop',
  'ev_parking',
] as const;

export const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const ConnectorSchema = new Schema<IConnector>(
  {
    type: {
      type: String,
      enum: CONNECTOR_TYPES,
      required: [true, 'Connector type is required'],
    },
    powerKw: {
      type: Number,
      required: [true, 'Power (kW) is required'],
      min: [0.5, 'Power must be at least 0.5 kW'],
      max: [350, 'Power cannot exceed 350 kW'],
    },
    count: {
      type: Number,
      required: [true, 'Connector count is required'],
      min: [1, 'Must have at least 1 connector'],
    },
  },
  { _id: false }
);

const ScheduleEntrySchema = new Schema<IScheduleEntry>(
  {
    day: {
      type: String,
      enum: DAYS_OF_WEEK,
      required: true,
    },
    openTime: {
      type: String,
      required: true,
      match: [/^\d{2}:\d{2}$/, 'openTime must be in HH:MM format'],
    },
    closeTime: {
      type: String,
      required: true,
      match: [/^\d{2}:\d{2}$/, 'closeTime must be in HH:MM format'],
    },
  },
  { _id: false }
);

const OperatingHoursSchema = new Schema<IOperatingHours>(
  {
    alwaysOpen: { type: Boolean, default: false },
    schedule: { type: [ScheduleEntrySchema], default: [] },
  },
  { _id: false }
);

const AddressSchema = new Schema<IAddress>(
  {
    street: { type: String, default: null },
    city: { type: String, default: null },
    district: { type: String, default: null },
    country: { type: String, default: null },
    postalCode: { type: String, default: null },
    formattedAddress: { type: String, default: null },
  },
  { _id: false }
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const StationSchema = new Schema<IStation>(
  {
    // ── Identity ──────────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'Station name is required'],
      trim: true,
      minlength: [3, 'Name must be at least 3 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },

    // ── Geospatial ────────────────────────────────────────────────────────────
    // location is optional — Nominatim geocoding is non-blocking. If geocoding
    // fails or the quota is exhausted the station is saved without coords and
    // geocodePending is set to true for a later retry.
    location: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number],
        validate: {
          validator: (v: number[]) =>
            !v ||
            (Array.isArray(v) &&
              v.length === 2 &&
              v[0] >= -180 &&
              v[0] <= 180 &&
              v[1] >= -90 &&
              v[1] <= 90),
          message: 'Coordinates must be [longitude, latitude] within valid ranges',
        },
      },
    },
    geocodePending: { type: Boolean, default: false, index: true },
    address: { type: AddressSchema, default: {} },

    // ── Ownership ─────────────────────────────────────────────────────────────
    submittedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Submitted-by user is required'],
      index: true,
    },

    // ── Technical ─────────────────────────────────────────────────────────────
    connectors: {
      type: [ConnectorSchema],
      required: [true, 'At least one connector is required'],
      validate: {
        validator: (v: IConnector[]) => Array.isArray(v) && v.length >= 1,
        message: 'At least one connector must be provided',
      },
    },
    solarPanelKw: {
      type: Number,
      required: [true, 'Solar panel capacity (kW) is required'],
      min: [0.1, 'Solar panel capacity must be at least 0.1 kW'],
      max: [10000, 'Solar panel capacity cannot exceed 10,000 kW'],
    },

    // ── Metadata ──────────────────────────────────────────────────────────────
    amenities: {
      type: [String],
      enum: {
        values: AMENITY_VALUES as unknown as string[],
        message: '{VALUE} is not a valid amenity',
      },
      default: [],
    },
    images: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 5,
        message: 'A maximum of 5 images are allowed',
      },
    },
    operatingHours: { type: OperatingHoursSchema, default: {} },

    // ── Status / moderation ───────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending', 'active', 'inactive', 'rejected'],
      default: 'pending',
      index: true,
    },
    isVerified: { type: Boolean, default: false, index: true },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    rejectionReason: {
      type: String,
      default: null,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
    },

    // ── Features ──────────────────────────────────────────────────────────────
    isFeatured: { type: Boolean, default: false, index: true },
    averageRating: {
      type: Number,
      default: 0,
      min: [0, 'Rating cannot be negative'],
      max: [5, 'Rating cannot exceed 5'],
      index: true,
    },
    reviewCount: { type: Number, default: 0, min: 0, index: true },

    // ── Soft delete ───────────────────────────────────────────────────────────
    isActive: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

StationSchema.index({ location: '2dsphere' });

StationSchema.index(
  { name: 'text', description: 'text', 'address.city': 'text' },
  { name: 'station_text_search', weights: { name: 3, 'address.city': 2, description: 1 } }
);

StationSchema.index({ status: 1, isActive: 1 });
StationSchema.index({ isVerified: 1, isActive: 1 });
StationSchema.index({ isFeatured: 1, averageRating: -1 });
StationSchema.index({ submittedBy: 1, status: 1 });

// ─── Model ────────────────────────────────────────────────────────────────────

export type StationModel = Model<IStation>;

const Station = mongoose.model<IStation, StationModel>('Station', StationSchema);

export default Station;
