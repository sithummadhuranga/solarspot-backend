

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
