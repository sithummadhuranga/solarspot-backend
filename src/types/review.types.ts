/**
 * Review TypeScript interfaces.
 * Owner: Member 2 — expand fields when implementing review.model.ts.
 * Ref: PROJECT_OVERVIEW.md → Database → reviews collection
 */

import { Document, Types } from 'mongoose';

// ─── Moderation status ──────────────────────────────────────────────────────
export type ModerationStatus = 'approved' | 'pending' | 'rejected' | 'flagged';

// ─── Review document ────────────────────────────────────────────────────────
// Compound unique index: { station, author }
// TODO: Member 2 — add all fields here when implementing review.model.ts
export interface IReview extends Document {
  _id: Types.ObjectId;
  station: Types.ObjectId;        // ref: 'Station'
  author: Types.ObjectId;         // ref: 'User'
  rating: number;                 // 1–5
  content: string;
  moderationStatus: ModerationStatus;
  toxicityScore?: number;         // select: false — from Perspective API
  isFlagged: boolean;
  flaggedBy?: Types.ObjectId[];
  helpfulCount: number;
  helpfulVotes?: Types.ObjectId[]; // users who marked helpful
  moderatedBy?: Types.ObjectId;
  moderationNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── DTOs ───────────────────────────────────────────────────────────────────
export interface CreateReviewInput {
  station: string;
  rating: number;
  content: string;
  // TODO: Member 2 — add additional fields (e.g. images)
}

export interface UpdateReviewInput {
  rating?: number;
  content?: string;
}

export interface ModerateReviewInput {
  moderationStatus: ModerationStatus;
  moderationNote?: string;
}

export interface ListReviewsQuery {
  page?: number;
  limit?: number;
  stationId?: string;
  authorId?: string;
  moderationStatus?: ModerationStatus;
  // TODO: Member 2 — add additional filter fields
}
