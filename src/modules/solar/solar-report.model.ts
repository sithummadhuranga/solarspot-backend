/**
 * SolarReport model — crowdsourced solar output observations per station visit.
 *
 * Ref: SolarIntelligence_Module_Prompt.md → A1
 */

import { Schema, model, Types } from 'mongoose';

export interface IWeatherSnapshot {
  cloudCoverPct: number;
  uvIndex: number;
  temperatureC: number;
  windSpeedKph: number;
  weatherMain: string;
  weatherIcon: string;
  capturedAt: Date;
  isFallback?: boolean;
}

export interface ISolarReport {
  _id: Types.ObjectId;
  station: Types.ObjectId;
  submittedBy: Types.ObjectId;
  visitedAt: Date;
  weatherSnapshot: IWeatherSnapshot;
  estimatedOutputKw: number;
  actualOutputKw: number | null;
  accuracyPct: number | null;
  accuracyLabel?: string;
  solarScore: number;
  notes: string | null;
  status: 'draft' | 'published' | 'archived';
  isPublic: boolean;
  isActive: boolean;
  deletedAt: Date | null;
  deletedBy: Types.ObjectId | null;
  schemaVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

const WeatherSnapshotSchema = new Schema<IWeatherSnapshot>(
  {
    cloudCoverPct: { type: Number, required: true, min: 0, max: 100 },
    uvIndex: { type: Number, required: true, min: 0, max: 11 },
    temperatureC: { type: Number, required: true, min: -50, max: 60 },
    windSpeedKph: { type: Number, required: true, min: 0 },
    weatherMain: { type: String, required: true, trim: true },
    weatherIcon: { type: String, required: true, trim: true },
    capturedAt: { type: Date, required: true },
    isFallback: { type: Boolean, default: false },
  },
  { _id: false },
);

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const solarReportSchema = new Schema<ISolarReport>(
  {
    station: {
      type: Schema.Types.ObjectId,
      ref: 'Station',
      required: true,
      index: true,
    },
    submittedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    visitedAt: {
      type: Date,
      required: true,
      index: -1,
      validate: {
        validator: (value: Date) => {
          const now = Date.now();
          return value.getTime() >= now - THIRTY_DAYS_MS && value.getTime() <= now;
        },
        message: 'visitedAt must be within the last 30 days and not in the future',
      },
    },
    weatherSnapshot: { type: WeatherSnapshotSchema, required: true },
    estimatedOutputKw: {
      type: Number,
      required: true,
      min: 0,
    },
    actualOutputKw: {
      type: Number,
      min: 0,
      default: null,
    },
    accuracyPct: {
      type: Number,
      min: 0,
      max: 200,
      default: null,
    },
    solarScore: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'published',
      index: true,
    },
    isPublic: { type: Boolean, default: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    schemaVersion: { type: String, default: '1.0' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

solarReportSchema.index({ station: 1, visitedAt: -1 });
solarReportSchema.index({ station: 1, status: 1, isActive: 1 });
solarReportSchema.index({ submittedBy: 1, isActive: 1 });
solarReportSchema.index({ station: 1, submittedBy: 1 });
solarReportSchema.index({ solarScore: -1 });
solarReportSchema.index({ accuracyPct: 1 }, { sparse: true });

solarReportSchema.virtual('accuracyLabel').get(function (this: ISolarReport): string {
  if (this.accuracyPct === null) return 'No Data';
  if (this.accuracyPct >= 110) return 'Overperforming';
  if (this.accuracyPct >= 90) return 'Accurate';
  if (this.accuracyPct >= 70) return 'Slightly Under';
  return 'Underperforming';
});

solarReportSchema.pre('save', async function () {
  if (!this.isModified('actualOutputKw')) return;

  if (this.actualOutputKw !== null) {
    if (this.estimatedOutputKw > 0) {
      this.accuracyPct = parseFloat(
        ((this.actualOutputKw / this.estimatedOutputKw) * 100).toFixed(1),
      );
    } else {
      this.accuracyPct = null;
    }
    return;
  }

  this.accuracyPct = null;
});

export const SolarReport = model<ISolarReport>('SolarReport', solarReportSchema, 'solar_reports');
