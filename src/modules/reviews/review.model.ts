/**
 * Review model — Mongoose schema.
 *
 * Owner: Member 2
 * Ref: PROJECT_OVERVIEW.md → Database → reviews collection
 *      MASTER_PROMPT.md → ACID — post-save hook uses aggregation to recalculate station rating
 */

import { Schema, model, Document, Types } from 'mongoose';
import type { IReview } from '@/types';
import { Station } from '@modules/stations/station.model';
import logger from '@utils/logger';

const reviewSchema = new Schema<IReview & Document>(
  {
    // ── Core ──────────────────────────────────────────────────────────────
    station: { type: Schema.Types.ObjectId, ref: 'Station', required: true, index: true },
    author:  { type: Schema.Types.ObjectId, ref: 'User',    required: true, index: true },
    rating:  { type: Number, required: true, min: 1, max: 5 },
    title:   { type: String, trim: true, maxlength: 120 },
    content: { type: String, required: true, trim: true, maxlength: 2000 },

    // ── Moderation ────────────────────────────────────────────────────────
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

    // ── Flagging ──────────────────────────────────────────────────────────
    isFlagged:  { type: Boolean, default: false },
    flaggedBy:  { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    flagCount:  { type: Number, default: 0, min: 0 },

    // ── Helpful votes ─────────────────────────────────────────────────────
    helpfulVotes: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    helpfulCount: { type: Number, default: 0, min: 0 },

    // ── Soft delete ──────────────────────────────────────────────────────
    isActive:  { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

// ── Indexes ──────────────────────────────────────────────────────────────────
// One review per user per station — database-level guarantee
reviewSchema.index({ station: 1, author: 1 }, { unique: true });
reviewSchema.index({ station: 1, moderationStatus: 1 });

// ── Post-save hook — recalculate station.averageRating + reviewCount ─────────
// Uses aggregation pipeline with $avg for accuracy (ACID: consistency rule)
reviewSchema.post('save', async function () {
  const stationId = this.station;
  try {
    const [agg] = await Review.aggregate([
      { $match: { station: new Types.ObjectId(stationId.toString()), moderationStatus: 'approved', isActive: true } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);

    const avgRating  = agg ? Math.round(agg.avg * 10) / 10 : 0;
    const count      = agg?.count ?? 0;

    // Atomic $set — no read-modify-write race condition
    await Station.findByIdAndUpdate(stationId, {
      $set: { averageRating: avgRating, reviewCount: count },
    });
  } catch (err) {
    logger.error(`[reviews] Failed to recalculate station rating for ${stationId}: ${err}`);
  }
});

// Also recalculate on findOneAndUpdate (for soft-deletes, moderation changes)
reviewSchema.post('findOneAndUpdate', async function () {
  const update = this.getUpdate() as Record<string, unknown> | null;
  const filter = this.getFilter();

  // Only recalculate if the update affected fields that impact the rating
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
