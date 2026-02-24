/**
 * QuotaUsage model — tracks API call counts per service per time window.
 *
 * Ref: PROJECT_OVERVIEW.md → Quota Management → MongoDB M0 Free Tier Limits
 *      MASTER_PROMPT.md → Quota Service — 80% of free-tier limits enforced
 */

import { Schema, model, Document } from 'mongoose';

export interface IQuotaUsage extends Document {
  service:   string;
  date:      string;
  count:     number;
}

const quotaUsageSchema = new Schema<IQuotaUsage>(
  {
    service: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: String,
      required: true,
    },
    count: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

quotaUsageSchema.index({ service: 1, date: 1 }, { unique: true });

export const QuotaUsage = model<IQuotaUsage>('QuotaUsage', quotaUsageSchema);
