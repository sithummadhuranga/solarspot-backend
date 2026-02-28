/**
 * Review TypeScript interfaces.
 * Owner: Member 2
 * Ref: PROJECT_OVERVIEW.md → Database → reviews collection
 */

import { Document, Types } from 'mongoose';

// ─── Moderation status ──────────────────────────────────────────────────────
export type ModerationStatus = 'approved' | 'pending' | 'rejected' | 'flagged';

// ─── Sort options ───────────────────────────────────────────────────────────
export type ReviewSortOption = 'newest' | 'oldest' | 'highest' | 'lowest' | 'helpful';

// ─── Review document ────────────────────────────────────────────────────────
// Compound unique index: { station, author }
export interface IReview extends Document {
  _id: Types.ObjectId;
  station: Types.ObjectId;        // ref: 'Station'
  author: Types.ObjectId;         // ref: 'User'
  rating: number;                 // 1–5
  title?: string;                 // max 120 chars
  content: string;                // max 2000 chars
  moderationStatus: ModerationStatus;
  toxicityScore?: number;         // select: false — from Perspective API
  isFlagged: boolean;
  flaggedBy: Types.ObjectId[];
  flagCount: number;
  helpfulCount: number;
  helpfulVotes: Types.ObjectId[];  // users who marked helpful
  moderatedBy?: Types.ObjectId;
  moderatedAt?: Date;
  moderationNote?: string;
  isActive: boolean;              // soft delete
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── DTOs ───────────────────────────────────────────────────────────────────
export interface CreateReviewInput {
  station: string;
  rating: number;
  title?: string;
  content: string;
}

export interface UpdateReviewInput {
  rating?: number;
  title?: string;
  content?: string;
}

export interface ModerateReviewInput {
  moderationStatus: 'approved' | 'rejected';
  moderationNote?: string;
}

export interface FlagReviewInput {
  reason?: string;
}

export interface ListReviewsQuery {
  page?: number;
  limit?: number;
  stationId?: string;
  authorId?: string;
  moderationStatus?: ModerationStatus;
  sort?: ReviewSortOption;
}
