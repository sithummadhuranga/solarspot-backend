import { Schema, model, Document, Types } from 'mongoose';
import type { IStation, IConnector, IScheduleEntry, IOperatingHours, IStationAddress } from '@/types';

export const CONNECTOR_TYPES = ['USB-C', 'Type-2', 'CCS', 'CHAdeMO', 'Tesla-NACS', 'AC-Socket'] as const;
export const AMENITY_VALUES  = ['wifi', 'cafe', 'restroom', 'parking', 'security', 'shade', 'water', 'repair_shop', 'ev_parking'] as const;
export const DAYS_OF_WEEK    = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const ConnectorSchema = new Schema<IConnector>(
  {
    type:    { type: String, enum: CONNECTOR_TYPES, required: true },
    powerKw: { type: Number, required: true, min: 0.5, max: 350 },
    count:   { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const ScheduleEntrySchema = new Schema<IScheduleEntry>(
  {
    day:       { type: String, enum: DAYS_OF_WEEK, required: true },
    openTime:  { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    closeTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
  },
  { _id: false },
);

const OperatingHoursSchema = new Schema<IOperatingHours>(
  {
    alwaysOpen: { type: Boolean, default: false },
    schedule:   { type: [ScheduleEntrySchema], default: [] },
  },
  { _id: false },
);

const AddressSchema = new Schema<IStationAddress>(
  {
    street:           { type: String, default: null },
    city:             { type: String, default: null },
    district:         { type: String, default: null },
    country:          { type: String, default: null },
    postalCode:       { type: String, default: null },
    formattedAddress: { type: String, default: null },
  },
  { _id: false },
);

const stationSchema = new Schema<IStation & Document>(
  {
    name:        { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000 },

    location: {
      type:        { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
    },
    geocodePending: { type: Boolean, default: false, index: true },
    address:        { type: AddressSchema, default: {} },

    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    connectors: {
      type: [ConnectorSchema],
      required: true,
      validate: { validator: (v: IConnector[]) => v.length >= 1, message: 'At least one connector required' },
    },
    solarPanelKw: { type: Number, required: true, min: 0.1, max: 10000 },
    amenities:    { type: [String], enum: AMENITY_VALUES as unknown as string[], default: [] },
    images:       { type: [String], default: [], validate: { validator: (v: string[]) => v.length <= 5, message: 'Max 5 images' } },
    operatingHours: { type: OperatingHoursSchema, default: {} },

    status:          { type: String, enum: ['pending', 'active', 'inactive', 'rejected'], default: 'pending', index: true },
    isVerified:      { type: Boolean, default: false, index: true },
    verifiedBy:      { type: Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt:      { type: Date, default: null },
    rejectionReason: { type: String, default: null, maxlength: 500 },

    isFeatured:    { type: Boolean, default: false, index: true },
    averageRating: { type: Number, default: 0, min: 0, max: 5, index: true },
    reviewCount:   { type: Number, default: 0, min: 0 },

    isActive:  { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

stationSchema.index({ location: '2dsphere' });
stationSchema.index(
  { name: 'text', description: 'text', 'address.city': 'text' },
  { name: 'station_text_search', weights: { name: 3, 'address.city': 2, description: 1 } },
);
stationSchema.index({ status: 1, isActive: 1 });
stationSchema.index({ isFeatured: 1, averageRating: -1 });
stationSchema.index({ submittedBy: 1, status: 1 });

export const Station = model<IStation & Document>('Station', stationSchema);
export type { IStation };
