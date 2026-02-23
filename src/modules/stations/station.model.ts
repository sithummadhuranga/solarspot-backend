/**
 * Station model — Mongoose schema with discriminator pattern.
 *
 * TODO: Member 1 — implement fields, 2dsphere index, discriminator sub-schemas.
 *
 * Ref: PROJECT_OVERVIEW.md → Data Models → Station (~35 fields listed)
 *      MASTER_PROMPT.md → Discriminator Pattern for station types
 *      MASTER_PROMPT.md → ACID — 2dsphere index required for geospatial queries
 */

import { Schema, model, Document } from 'mongoose';
import type { IStation } from '@/types';

const stationSchema = new Schema<IStation & Document>(
  {
    // ── Core ──────────────────────────────────────────────────────────────
    // name:            { type: String, required: true, trim: true, maxlength: 120 },
    // description:     { type: String, trim: true, maxlength: 1000 },
    // type:            { type: String, enum: ['charging', 'solar_panel'], required: true },
    // status:          { type: String, enum: ['active','inactive','maintenance','pending_review'], default: 'pending_review' },
    // owner:           { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // ── Location ─────────────────────────────────────────────────────────
    // location: {
    //   type:        { type: String, enum: ['Point'], default: 'Point' },
    //   coordinates: { type: [Number], required: true },  // [lng, lat]
    // },
    // address: {
    //   street:  String,
    //   city:    String,
    //   state:   String,
    //   country: String,
    //   zip:     String,
    // },

    // ── Media ─────────────────────────────────────────────────────────────
    // images:  [{ type: String }],   // Cloudinary URLs
    // thumbnail: String,

    // ── Ratings (maintained by review post-save hook) ──────────────────
    // averageRating: { type: Number, default: 0, min: 0, max: 5 },
    // reviewCount:   { type: Number, default: 0 },

    // ── Discriminator key ────────────────────────────────────────────────
    // stationType: { type: String, required: true },  // discriminator key

    // ── Soft delete ──────────────────────────────────────────────────────
    // isDeleted:   { type: Boolean, default: false },
    // deletedAt:   Date,
  },
  { timestamps: true, discriminatorKey: 'stationType' },
);

// ── Indexes ──────────────────────────────────────────────────────────────────
// TODO: Member 1 — 2dsphere required for $near/$geoWithin queries
// stationSchema.index({ location: '2dsphere' });
// stationSchema.index({ status: 1 });
// stationSchema.index({ owner: 1 });
// stationSchema.index({ type: 1, status: 1 });
// stationSchema.index({ isDeleted: 1 });

export const Station = model<IStation & Document>('Station', stationSchema);

// ── Discriminator models ──────────────────────────────────────────────────────
// TODO: Member 1 — define ChargingStation and SolarPanel discriminator schemas
//
// const chargingStationSchema = new Schema({
//   connectorTypes:  [{ type: String }], // e.g. ['CCS','CHAdeMO','Type2']
//   maxPowerKw:      Number,
//   pricePerKwh:     Number,
//   availablePorts:  Number,
//   totalPorts:      Number,
// });
//
// const solarPanelSchema = new Schema({
//   capacityKw:      Number,
//   panelCount:      Number,
//   manufacturer:    String,
//   installDate:     Date,
// });
//
// export const ChargingStation = Station.discriminator('ChargingStation', chargingStationSchema);
// export const SolarPanel =      Station.discriminator('SolarPanel',      solarPanelSchema);
