/**
 * SolarReport — Mongoose schema for crowdsourced solar output observations.
 *
 * Users visit a charging station, observe the actual solar output, and submit a
 * report. We compare their observation (actualOutputKw) against what we predicted
 * from the live weather (estimatedOutputKw) at the time of their visit, yielding
 * an accuracyPct that becomes the station's reliability signal over time.
 *
 * Design notes:
 *  - visitedAt is user-supplied and may differ from createdAt (offline submissions).
 *  - estimatedOutputKw is calculated server-side at submission time — never trusted
 *    from the client.
 *  - actualOutputKw is optional; users may submit observation notes without a reading.
 *    When provided, the pre-save hook computes accuracyPct.
 *  - status: 'draft' → 'published' lifecycle lets users refine before going public.
 *  - isActive / isDeleted enable soft-delete so analytics remain consistent.
 *
 * Owner: Member 3 · Ref: PROJECT_OVERVIEW.md → Weather (6 endpoints extended)
 *                         MASTER_PROMPT.md → ACID / SOLID
 */

import { Schema, model, Document, Types } from 'mongoose';

// ── Embedded sub-document: snapshot of weather at time of visit ───────────────

export interface IWeatherSnapshot {
  cloudCoverPct:  number;
  uvIndex:        number;
  temperatureC:   number;
  windSpeedKph:   number;
  weatherMain:    string;   // OWM main label: "Clear", "Clouds", "Rain", …
  weatherIcon:    string;   // OWM icon code, e.g. "01d"
  capturedAt:     Date;
  isFallback?:    boolean;  // true when OWM was down and we used a cached/estimated snapshot
}

// ── Main document interface ───────────────────────────────────────────────────

export interface ISolarReport {
  _id:               Types.ObjectId;
  station:           Types.ObjectId;
  submittedBy:       Types.ObjectId;

  // When the user was physically at the station (may be in the past)
  visitedAt:         Date;

  // Weather conditions at the moment of submission (server-stamped)
  weatherSnapshot:   IWeatherSnapshot;

  // Server-calculated predicted output based on weatherSnapshot + station.solarPanelKw
  estimatedOutputKw: number;

  // User-reported actual output — optional; null = "I didn't observe the meter"
  actualOutputKw:    number | null;

  // Derived from actualOutputKw ÷ estimatedOutputKw × 100 (hook-computed, sparse)
  accuracyPct:       number | null;

  // Discrete solar quality score 0–10 (derived by formula in pre-save)
  solarScore:        number;

  // Free-text observation notes (optional)
  notes:             string | null;

  // Visibility: draft whilst user is still editing, published when ready for analytics
  status:            'draft' | 'published';

  // Public reports appear in aggregate analytics; private stay per-user
  isPublic:          boolean;

  // Soft-delete — never hard-delete so historical analytics are stable
  isActive:          boolean;
  isDeleted:         boolean;
  deletedAt:         Date | null;

  // Mongoose timestamps
  createdAt:         Date;
  updatedAt:         Date;
}

// ── Weather snapshot sub-schema ───────────────────────────────────────────────

const WeatherSnapshotSchema = new Schema<IWeatherSnapshot>(
  {
    cloudCoverPct: { type: Number, required: true, min: 0, max: 100 },
    uvIndex:       { type: Number, required: true, min: 0, max: 20 },
    temperatureC:  { type: Number, required: true, min: -50, max: 70 },
    windSpeedKph:  { type: Number, required: true, min: 0 },
    weatherMain:   { type: String, required: true, trim: true },
    weatherIcon:   { type: String, required: true, trim: true },
    capturedAt:    { type: Date,   required: true },
    isFallback:    { type: Boolean, default: false },
  },
  { _id: false },
);

// ── Main schema ───────────────────────────────────────────────────────────────

const solarReportSchema = new Schema<ISolarReport & Document>(
  {
    station: {
      type:     Schema.Types.ObjectId,
      ref:      'Station',
      required: true,
      index:    true,
    },
    submittedBy: {
      type:     Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },

    visitedAt: {
      type:     Date,
      required: true,
      // Cannot be more than 7 days in the past or in the future
      validate: {
        validator: (v: Date) => {
          const now      = Date.now();
          const sevenDays = 7 * 24 * 60 * 60 * 1000;
          return v.getTime() >= now - sevenDays && v.getTime() <= now + 60_000;
        },
        message: 'visitedAt must be within the last 7 days and not in the future',
      },
    },

    weatherSnapshot:   { type: WeatherSnapshotSchema, required: true },

    estimatedOutputKw: {
      type:     Number,
      required: true,
      min:      0,
    },

    actualOutputKw: {
      type:    Number,
      min:     0,
      max:     500,
      default: null,
    },

    accuracyPct: {
      type:    Number,
      min:     0,
      max:     200,  // allow up to 200% to surface over-performing stations
      default: null,
      // sparse index defined below via solarReportSchema.index()
    },

    solarScore: {
      type:    Number,
      min:     0,
      max:     10,
      default: 0,
    },

    notes: {
      type:      String,
      trim:      true,
      maxlength: 1000,
      default:   null,
    },

    status: {
      type:    String,
      enum:    ['draft', 'published'],
      default: 'draft',
      index:   true,
    },

    isPublic:  { type: Boolean, default: true,  index: true },
    isActive:  { type: Boolean, default: true,  index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date,   default: null },
  },
  { timestamps: true },
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Primary time-series query: all reports for a station in reverse-chronological order
solarReportSchema.index({ station: 1, visitedAt: -1 });

// User's own report history
solarReportSchema.index({ submittedBy: 1, createdAt: -1 });

// Leaderboard / accuracy analysis (sparse — only documents with a value are indexed)
solarReportSchema.index({ accuracyPct: 1 }, { sparse: true });

// Compound for analytics pipeline: public published active reports per station  
solarReportSchema.index({ station: 1, status: 1, isPublic: 1, isDeleted: 1 });

// ── Virtual: human-readable accuracy label ────────────────────────────────────

solarReportSchema.virtual('accuracyLabel').get(function (this: ISolarReport): string {
  if (this.accuracyPct === null) return 'Not measured';
  if (this.accuracyPct >= 90)   return 'Excellent';
  if (this.accuracyPct >= 70)   return 'Good';
  if (this.accuracyPct >= 50)   return 'Fair';
  return 'Poor';
});

// ── Pre-save hook: compute accuracyPct from actualOutputKw ───────────────────

solarReportSchema.pre('save', async function () {
  if (this.isModified('actualOutputKw') && this.actualOutputKw !== null) {
    if (this.estimatedOutputKw > 0) {
      // Round to 2 decimal places to avoid floating-point noise in analytics
      this.accuracyPct = Math.round((this.actualOutputKw / this.estimatedOutputKw) * 100 * 100) / 100;
    } else {
      // Guard against division by zero (station with 0 kW panel is degenerate data)
      this.accuracyPct = null;
    }
  }
});

export const SolarReport = model<ISolarReport & Document>('SolarReport', solarReportSchema, 'solar_reports');
