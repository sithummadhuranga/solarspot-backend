import mongoose, { Document, Schema } from 'mongoose';

export type ThirdPartyService = 'openweathermap' | 'perspective' | 'brevo';

export interface IQuotaUsage extends Document {
  _id: mongoose.Types.ObjectId;
  service: ThirdPartyService;
  date: string; // format: YYYY-MM-DD
  count: number;
  createdAt: Date;
  updatedAt: Date;
}

const quotaUsageSchema = new Schema<IQuotaUsage>(
  {
    service: {
      type: String,
      required: [true, 'Service is required'],
      enum: {
        values: ['openweathermap', 'perspective', 'brevo'],
        message: '{VALUE} is not a valid third-party service',
      },
      index: true,
    },

    date: {
      type: String,
      required: [true, 'Date is required'],
      validate: {
        validator: (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v),
        message: 'Date must be in YYYY-MM-DD format',
      },
      index: true,
    },

    count: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Count cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Count must be an integer',
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound unique index: one document per service per day
quotaUsageSchema.index({ service: 1, date: 1 }, { unique: true });

const QuotaUsage = mongoose.model<IQuotaUsage>('QuotaUsage', quotaUsageSchema);
export default QuotaUsage;
