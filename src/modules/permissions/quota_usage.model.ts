/**
 * QuotaUsage model — tracks API call counts per service per time window.
 *
 * TODO: Member 4 — implement fields; QuotaService (src/services/quota.service.ts) reads/writes this.
 *
 * Ref: PROJECT_OVERVIEW.md → Quota Management → MongoDB M0 Free Tier Limits
 *      MASTER_PROMPT.md → Quota Service — 80% of free-tier limits enforced
 */

import { Schema, model, Document } from 'mongoose';

export interface IQuotaUsage extends Document {
  service:   string;     // e.g. 'openweather', 'cloudinary', 'nominatim'
  window:    string;     // e.g. '2025-01-15' (daily) or '2025-01' (monthly)
  count:     number;
  limit:     number;
  resetAt:   Date;
}

const quotaUsageSchema = new Schema<IQuotaUsage>(
  {
    // service:  { type: String, required: true },
    // window:   { type: String, required: true },      // YYYY-MM-DD or YYYY-MM
    // count:    { type: Number, default: 0 },
    // limit:    { type: Number, required: true },
    // resetAt:  { type: Date, required: true },
  },
  { timestamps: true },
);

// quotaUsageSchema.index({ service: 1, window: 1 }, { unique: true });

export const QuotaUsage = model<IQuotaUsage>('QuotaUsage', quotaUsageSchema);
