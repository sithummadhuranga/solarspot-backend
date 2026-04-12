

import { Schema, model, Document, Types } from 'mongoose';
import type { IReview } from '@/types';
import { Station } from '@modules/stations/station.model';
import logger from '@utils/logger';

const reviewSchema = new Schema<IReview & Document>(
  {
    station: { type: Schema.Types.ObjectId, ref: 'Station', required: true, index: true },
    author:  { type: Schema.Types.ObjectId, ref: 'User',    required: true, index: true },
    rating:  { type: Number, required: true, min: 1, max: 5 },
    title:   { type: String, trim: true, maxlength: 120 },
    content: { type: String, required: true, trim: true, maxlength: 2000 },

    moderationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'flagged'],
      default: 'approved',
      index: true,
    },
    toxicityScore: { type: Number, select: false },
    moderatedBy:   { type: Schema.Types.ObjectId, ref: 'User', default: null },
    moderatedAt:   { type: Date, default: null },
    moderationNote: { type: String, trim: true, maxlength: 500, default: null },

    isFlagged:  { type: Boolean, default: false },
    flaggedBy:  { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    flagCount:  { type: Number, default: 0, min: 0 },

    helpfulVotes: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    helpfulCount: { type: Number, default: 0, min: 0 },

    isActive:  { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

reviewSchema.index(
  { station: 1, author: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
reviewSchema.index({ station: 1, moderationStatus: 1 });

reviewSchema.post('save', async function () {
  const stationId = this.station;
  try {
    const [agg] = await Review.aggregate([
      { $match: { station: new Types.ObjectId(stationId.toString()), moderationStatus: 'approved', isActive: true } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);

    const avgRating  = agg ? Math.round(agg.avg * 10) / 10 : 0;
    const count      = agg?.count ?? 0;

    await Station.findByIdAndUpdate(stationId, {
      $set: { averageRating: avgRating, reviewCount: count },
    });
  } catch (err) {
    logger.error(`[reviews] Failed to recalculate station rating for ${stationId}: ${err}`);
  }
});

reviewSchema.post('findOneAndUpdate', async function () {
  const update = this.getUpdate() as Record<string, unknown> | null;
  const filter = this.getFilter();

  const setFields = (update?.['$set'] ?? update) as Record<string, unknown> | undefined;
  const affectsRating =
    setFields?.isActive !== undefined ||
    setFields?.moderationStatus !== undefined ||
    setFields?.rating !== undefined;

  if (!affectsRating || !filter?.['_id']) return;

  try {
    const doc = await Review.findById(filter['_id']).select('station').lean();
    if (!doc) return;

    const [agg] = await Review.aggregate([
      { $match: { station: new Types.ObjectId(doc.station.toString()), moderationStatus: 'approved', isActive: true } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);

    const avgRating = agg ? Math.round(agg.avg * 10) / 10 : 0;
    const count     = agg?.count ?? 0;

    await Station.findByIdAndUpdate(doc.station, {
      $set: { averageRating: avgRating, reviewCount: count },
    });
  } catch (err) {
    logger.error(`[reviews] Failed to recalculate station rating after update: ${err}`);
  }
});

export const Review = model<IReview & Document>('Review', reviewSchema);
export type { IReview };
