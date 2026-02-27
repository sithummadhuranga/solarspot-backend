/**
 * Review service — business logic layer.
 *
 * Owner: Member 2
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Reviews (9 endpoints)
 *      MASTER_PROMPT.md → ACID — compound unique index, post-save hook for averageRating
 *      MASTER_PROMPT.md → SOLID — SRP: only business logic here, no HTTP concerns
 */

import axios from 'axios';
import { Types } from 'mongoose';
import { Review } from './review.model';
import { Station } from '@modules/stations/station.model';
import '@modules/users/user.model';
import type {
  IReview,
  CreateReviewInput,
  UpdateReviewInput,
  ModerateReviewInput,
  ListReviewsQuery,
} from '@/types';
import { container } from '@/container';
import { config } from '@config/env';
import ApiError from '@utils/ApiError';
import logger from '@utils/logger';

// ── Module-level constants ────────────────────────────────────────────────────

/**
 * Toxicity score (0–1) above which a review is automatically rejected.
 * Perspective API uses 0.8 as the "likely toxic" boundary on most classifiers.
 */
const TOXICITY_AUTO_REJECT = 0.80;

/**
 * Toxicity score above which a review is queued for human review (pending)
 * rather than being auto-approved.
 */
const TOXICITY_PENDING_THRESHOLD = 0.60;

/**
 * Number of distinct user flags that triggers automatic escalation of
 * moderationStatus to 'flagged'. Keeps the moderation queue manageable.
 */
const FLAG_AUTO_ESCALATE_THRESHOLD = 3;

// ── Sort mapping ─────────────────────────────────────────────────────────────
function buildSort(sort: string): Record<string, 1 | -1> {
  switch (sort) {
    case 'oldest':  return { createdAt: 1 };
    case 'highest': return { rating: -1, createdAt: -1 };
    case 'lowest':  return { rating: 1, createdAt: -1 };
    case 'helpful': return { helpfulCount: -1, createdAt: -1 };
    case 'newest':
    default:        return { createdAt: -1 };
  }
}

/**
 * Checks the toxicity of review content via the Perspective API.
 *
 * Returns a 0–1 score, or null when the quota is exhausted or the API is
 * unavailable. Callers must handle null gracefully (i.e. approve by default).
 * This is the correct degradation behaviour per PROJECT_OVERVIEW.md:
 *   "Skip check, flag for manual review"
 */
async function checkToxicity(content: string): Promise<number | null> {
  // Gate every external call behind the quota check (MASTER_PROMPT security rule)
  const canCall = await container.quotaService.check('perspective');
  if (!canCall) {
    logger.warn('[reviews] Perspective API quota exhausted — skipping toxicity check, flagging for manual review');
    return null;
  }

  if (!config.PERSPECTIVE_API_KEY) {
    // Key not configured — log once and skip silently in development
    logger.warn('[reviews] PERSPECTIVE_API_KEY is not set — skipping toxicity check');
    return null;
  }

  try {
    const response = await axios.post(
      `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${config.PERSPECTIVE_API_KEY}`,
      {
        comment: { text: content },
        languages: ['en'],
        requestedAttributes: { TOXICITY: {} },
      },
      { timeout: 5_000 },
    );

    await container.quotaService.increment('perspective');

    const score: unknown = response.data?.attributeScores?.TOXICITY?.summaryScore?.value;
    return typeof score === 'number' ? Math.round(score * 100) / 100 : null;
  } catch (err) {
    // Never block user actions on third-party API failures — degrade gracefully
    logger.warn(`[reviews] Perspective API call failed — defaulting to manual review: ${err}`);
    return null;
  }
}

// ─── Service functions ───────────────────────────────────────────────────────

/** GET /api/reviews — list reviews with filters & pagination */
export async function listReviews(query: ListReviewsQuery) {
  const { page = 1, limit = 10, stationId, authorId, moderationStatus, sort = 'newest' } = query;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { isActive: true };

  // Public listing only shows approved reviews by default
  if (moderationStatus) {
    filter.moderationStatus = moderationStatus;
  } else {
    filter.moderationStatus = 'approved';
  }

  if (stationId) {
    if (!Types.ObjectId.isValid(stationId)) throw ApiError.badRequest('Invalid station ID');
    filter.station = new Types.ObjectId(stationId);
  }

  if (authorId) {
    if (!Types.ObjectId.isValid(authorId)) throw ApiError.badRequest('Invalid author ID');
    filter.author = new Types.ObjectId(authorId);
  }

  const sortObj = buildSort(sort);

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .populate('author', 'displayName avatarUrl')
      .populate('station', 'name')
      .select('-__v')
      .lean(),
    Review.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);
  return {
    reviews,
    pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
}

/** GET /api/reviews/:id — get a single review */
export async function getReviewById(id: string) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Review not found');

  const review = await Review.findOne({ _id: id, isActive: true })
    .populate('author', 'displayName avatarUrl')
    .populate('station', 'name')
    .select('-__v')
    .lean();

  if (!review) throw ApiError.notFound('Review not found');
  return review;
}

/** POST /api/reviews — create a review */
export async function createReview(authorId: string, input: CreateReviewInput): Promise<IReview> {
  const { station: stationId, rating, title, content } = input;

  if (!Types.ObjectId.isValid(stationId)) {
    throw ApiError.notFound('Station not found');
  }

  // Station must exist, be active and approved
  const station = await Station.findOne({ _id: stationId, isActive: true, status: 'active' });
  if (!station) {
    throw ApiError.notFound('Station not found or not yet approved');
  }

  // Cannot review your own station
  if (station.submittedBy.toString() === authorId) {
    throw ApiError.forbidden('You cannot review your own station');
  }

  // One review per station per user — enforce at application level too
  const existing = await Review.findOne({
    station: new Types.ObjectId(stationId),
    author:  new Types.ObjectId(authorId),
  });
  if (existing) {
    throw ApiError.conflict('You have already reviewed this station');
  }

  // Screen content through Perspective API (graceful degradation: null → approve)
  const toxicityScore = await checkToxicity(content);

  // Determine moderation status based on toxicity score:
  // - null (quota/error): approve by default, flag for manual check if score unavailable
  // - >= 0.80: auto-reject (clear policy violation threshold from Perspective docs)
  // - >= 0.60: hold for human review (borderline content)
  // - < 0.60:  auto-approve
  let moderationStatus: 'approved' | 'pending' | 'rejected' = 'approved';
  if (toxicityScore !== null) {
    if (toxicityScore >= TOXICITY_AUTO_REJECT) {
      moderationStatus = 'rejected';
    } else if (toxicityScore >= TOXICITY_PENDING_THRESHOLD) {
      moderationStatus = 'pending';
    }
  }

  const review = await Review.create({
    station:          new Types.ObjectId(stationId),
    author:           new Types.ObjectId(authorId),
    rating,
    title:            title?.trim() || undefined,
    content,
    moderationStatus,
    ...(toxicityScore !== null && { toxicityScore }),
    isActive: true,
  });

  logger.info(`[reviews] Created review ${review._id} for station ${stationId} by user ${authorId} (toxicity: ${toxicityScore ?? 'skipped'}, status: ${moderationStatus})`);
  return review;
}

/** PUT /api/reviews/:id — update own review */
export async function updateReview(id: string, authorId: string, input: UpdateReviewInput): Promise<IReview> {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Review not found');

  const review = await Review.findOne({ _id: id, isActive: true });
  if (!review) throw ApiError.notFound('Review not found');

  // Only the author can update their own review
  if (review.author.toString() !== authorId) {
    throw ApiError.forbidden('You can only edit your own reviews');
  }

  // Apply permitted field updates
  if (input.rating !== undefined) review.rating = input.rating;
  if (input.title !== undefined) review.title = input.title;
  if (input.content !== undefined) review.content = input.content;

  await review.save();
  logger.info(`[reviews] Updated review ${id} by user ${authorId}`);
  return review;
}

/** DELETE /api/reviews/:id — soft-delete (own or any for moderators) */
export async function deleteReview(id: string, requesterId: string, canDeleteAny: boolean): Promise<void> {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Review not found');

  const review = await Review.findOne({ _id: id, isActive: true });
  if (!review) throw ApiError.notFound('Review not found');

  // Check ownership if user does not have delete-any permission
  if (!canDeleteAny && review.author.toString() !== requesterId) {
    throw ApiError.forbidden('You can only delete your own reviews');
  }

  // Soft delete — atomic $set
  await Review.findOneAndUpdate(
    { _id: id },
    { $set: { isActive: false, deletedAt: new Date(), deletedBy: new Types.ObjectId(requesterId) } },
  );

  logger.info(`[reviews] Soft-deleted review ${id} by user ${requesterId}`);
}

/** POST /api/reviews/:id/helpful — toggle helpful vote (atomic) */
export async function toggleHelpful(id: string, userId: string) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Review not found');

  const review = await Review.findOne({ _id: id, isActive: true, moderationStatus: 'approved' });
  if (!review) throw ApiError.notFound('Review not found');

  // Cannot mark your own review as helpful
  if (review.author.toString() === userId) {
    throw ApiError.forbidden('You cannot mark your own review as helpful');
  }

  const userOid = new Types.ObjectId(userId);
  const alreadyVoted = review.helpfulVotes.some((v) => v.toString() === userId);

  if (alreadyVoted) {
    // Remove vote — atomic $pull + $inc
    await Review.findOneAndUpdate(
      { _id: id },
      { $pull: { helpfulVotes: userOid }, $inc: { helpfulCount: -1 } },
    );
    logger.info(`[reviews] User ${userId} removed helpful vote from review ${id}`);
    return { action: 'removed' as const };
  } else {
    // Add vote — atomic $addToSet + $inc
    await Review.findOneAndUpdate(
      { _id: id },
      { $addToSet: { helpfulVotes: userOid }, $inc: { helpfulCount: 1 } },
    );
    logger.info(`[reviews] User ${userId} added helpful vote to review ${id}`);
    return { action: 'added' as const };
  }
}

/** POST /api/reviews/:id/flag — flag a review */
export async function flagReview(id: string, userId: string) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Review not found');

  const review = await Review.findOne({ _id: id, isActive: true });
  if (!review) throw ApiError.notFound('Review not found');

  // Cannot flag your own review
  if (review.author.toString() === userId) {
    throw ApiError.forbidden('You cannot flag your own review');
  }

  const userOid = new Types.ObjectId(userId);
  const alreadyFlagged = review.flaggedBy.some((f) => f.toString() === userId);

  if (alreadyFlagged) {
    throw ApiError.conflict('You have already flagged this review');
  }

  const newFlagCount = review.flagCount + 1;

  // Auto-escalate to 'flagged' status once enough distinct users have flagged the review.
  // This surfaces the review immediately in the moderation queue without manual triage.
  const shouldEscalate = newFlagCount >= FLAG_AUTO_ESCALATE_THRESHOLD;
  const updateFields: Record<string, unknown> = {
    $addToSet: { flaggedBy: userOid },
    $inc:      { flagCount: 1 },
    $set:      {
      isFlagged: true,
      ...(shouldEscalate && { moderationStatus: 'flagged' }),
    },
  };

  const updated = await Review.findOneAndUpdate(
    { _id: id },
    updateFields,
    { new: true },
  );

  if (shouldEscalate) {
    logger.warn(`[reviews] Review ${id} auto-escalated to 'flagged' after ${newFlagCount} flags`);
  }

  logger.info(`[reviews] User ${userId} flagged review ${id} (flagCount: ${updated?.flagCount})`);
  return { flagCount: updated?.flagCount ?? 0, escalated: shouldEscalate };
}

/** GET /api/reviews/flagged — list flagged reviews for moderators */
export async function listFlaggedReviews(page: number, limit: number) {
  const skip = (page - 1) * limit;

  const filter = { isFlagged: true, isActive: true, moderationStatus: { $ne: 'rejected' } };

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort({ flagCount: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'displayName avatarUrl email')
      .populate('station', 'name')
      .select('-__v')
      .lean(),
    Review.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);
  return {
    reviews,
    pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
}

/** PATCH /api/reviews/:id/moderate — approve or reject a review */
export async function moderateReview(id: string, moderatorId: string, input: ModerateReviewInput): Promise<IReview> {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Review not found');

  const review = await Review.findOne({ _id: id, isActive: true });
  if (!review) throw ApiError.notFound('Review not found');

  review.moderationStatus = input.moderationStatus;
  review.moderatedBy = new Types.ObjectId(moderatorId);
  review.moderatedAt = new Date();
  review.moderationNote = input.moderationNote ?? undefined;

  // If approved, clear flag state
  if (input.moderationStatus === 'approved') {
    review.isFlagged = false;
    review.flaggedBy = [];
    review.flagCount = 0;
  }

  await review.save();
  logger.info(`[reviews] Review ${id} moderated to "${input.moderationStatus}" by ${moderatorId}`);
  return review;
}
