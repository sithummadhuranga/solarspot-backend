/**
 * Review model — Mongoose schema.
 *
 * TODO: Member 2 — implement fields, compound unique index, post-save hook for averageRating.
 *
 * Ref: PROJECT_OVERVIEW.md → Data Models → Review
 *      MASTER_PROMPT.md → ACID — post-save hook must use session, atomic $inc on Station
 */

import { Schema, model, Document } from 'mongoose';
import type { IReview } from '@/types';

const reviewSchema = new Schema<IReview & Document>(
  {
    // ── Core ──────────────────────────────────────────────────────────────
    // station:    { type: Schema.Types.ObjectId, ref: 'Station', required: true },
    // author:     { type: Schema.Types.ObjectId, ref: 'User',    required: true },
    // rating:     { type: Number, required: true, min: 1, max: 5 },
    // title:      { type: String, trim: true, maxlength: 120 },
    // body:       { type: String, trim: true, maxlength: 2000 },

    // ── Moderation ────────────────────────────────────────────────────────
    // moderationStatus: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
    // moderatedBy:  { type: Schema.Types.ObjectId, ref: 'User' },
    // moderatedAt:  Date,
    // moderationNote: String,

    // ── Likes / helpful votes ─────────────────────────────────────────────
    // likes:      [{ type: Schema.Types.ObjectId, ref: 'User' }],
    // likeCount:  { type: Number, default: 0 },

    // ── Soft delete ──────────────────────────────────────────────────────
    // isDeleted:  { type: Boolean, default: false },
    // deletedAt:  Date,
  },
  { timestamps: true },
);

// ── Indexes ──────────────────────────────────────────────────────────────────
// TODO: Member 2 — compound unique enforces one review per user per station
// reviewSchema.index({ station: 1, author: 1 }, { unique: true });
// reviewSchema.index({ station: 1, moderationStatus: 1 });
// reviewSchema.index({ author: 1 });

// ── Post-save hook — recalculate station.averageRating ────────────────────────
// TODO: Member 2 — ACID: use session, atomic $set on Station.averageRating + reviewCount
// reviewSchema.post('save', async function (doc, next) {
//   // const session = ...
//   // const { _id: stationId } = doc.station;
//   // const [agg] = await Review.aggregate([
//   //   { $match: { station: stationId, moderationStatus: 'approved', isDeleted: false } },
//   //   { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
//   // ]).session(session);
//   // await Station.findByIdAndUpdate(stationId, { averageRating: agg?.avg ?? 0, reviewCount: agg?.count ?? 0 }, { session });
//   // next();
// });

export const Review = model<IReview & Document>('Review', reviewSchema);
