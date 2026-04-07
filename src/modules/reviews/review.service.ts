/**
 * Review service — business logic layer.
 *
 * Owner: Member 2
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Reviews (9 endpoints)
 *      MASTER_PROMPT.md → ACID — compound unique index, post-save hook for averageRating
 *      MASTER_PROMPT.md → SOLID — SRP: only business logic here, no HTTP concerns
 */

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
import { config } from '@config/env';
import { container } from '@/container';
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

const HF_MODERATION_URL = 'https://router.huggingface.co/hf-inference/models/unitary/toxic-bert';

/**
 * Calls the HuggingFace Inference API (unitary/toxic-bert) and returns a
 * normalised toxicity score (0–1). toxic-bert is a BERT-based classifier
 * trained on millions of labelled toxic comments — it returns a direct
 * probability rather than requiring a structured prompt.
 *
 * Throws on network error, timeout, model-loading state, or malformed
 * response so the caller can fall back to the local scorer.
 */
async function callHuggingFaceModerator(content: string): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  let responseData: unknown;
  try {
    const res = await fetch(HF_MODERATION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: content }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`HuggingFace API returned HTTP ${res.status}: ${errBody.slice(0, 200)}`);
    }
    responseData = await res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }

  // Model in cold-start / loading state — treat as unavailable, let caller fall back
  if (typeof responseData === 'object' && responseData !== null && 'error' in responseData) {
    const errObj = responseData as { error: string; estimated_time?: number };
    throw new Error(
      `HuggingFace model not ready: ${errObj.error} (est. ${errObj.estimated_time ?? '?'}s)`,
    );
  }

  // Expected shape: [[{ label: 'toxic', score: 0.02 }, { label: 'non-toxic', score: 0.98 }]]
  const results = responseData as Array<Array<{ label: string; score: number }>>;
  const inner = results?.[0];
  if (!Array.isArray(inner)) {
    throw new Error(
      `HuggingFace returned unexpected shape: ${JSON.stringify(responseData).slice(0, 200)}`,
    );
  }

  const toxicEntry = inner.find(r => r.label.toLowerCase() === 'toxic');
  if (!toxicEntry) {
    throw new Error(`HuggingFace response missing 'toxic' label: ${JSON.stringify(inner)}`);
  }

  const score = toxicEntry.score;
  if (Number.isNaN(score) || score < 0 || score > 1) {
    throw new Error(`HuggingFace returned invalid score: ${score}`);
  }

  logger.info(`[reviews] HuggingFace toxic-bert score=${score.toFixed(3)}`);
  return score;
}

/**
 * Local regex-based fallback scorer — zero cost, zero network dependency.
 *
 * Scoring is additive (capped at 1.0):
 *   Tier 1 — explicit threats               → +0.80
 *   Tier 2 — severe slurs / KYS             → +0.50
 *   Tier 3 — moderate profanity / attacks   → +0.25
 *   Tier 4 — structural signals (caps/!!!!) → up to +0.15
 */
function localToxicityScore(content: string): number {
  let score = 0;
  const text = content.toLowerCase();

  const THREAT_PATTERNS: RegExp[] = [
    // Direct violence verb targeting a person (you, him, her, them, the owner, etc.)
    /\b(kill|murder|shoot|stab|rape|strangle)\s+(you|him|her|them|u)\b/i,
    /\b(kill|murder|shoot|stab|strangle)\s+the\s+\w+/i,
    // "I will/am going to kill/hurt [anyone]" — no restriction on the target word
    /\bi\s+(will|am going to|gonna|shall)\s+(kill|hurt|destroy|harm|attack)\b/i,
    /\byou('re| are| will be)\s+(going to\s+)?(die|dead|finished)\b/i,
    /\bi\s+know\s+where\s+you\s+live\b/i,
    /\b(death|bomb|shooting)\s+threat\b/i,
  ];
  if (THREAT_PATTERNS.some((p) => p.test(content))) score += 0.80;

  // Patterns use character-class variants to avoid embedding explicit slurs in source.
  const SEVERE_PATTERNS: RegExp[] = [
    /\bn[i!1][g9][g9][ae3]r+\b/i,
    /\bf[a@4][g9][g9][o0]+t+\b/i,
    /\bc[u*][n][t]+\b/i,
    /\b(go\s+kill\s+yourself|kys)\b/i,
    /\b(subhuman|vermin|parasite)\s+(race|people|community)\b/i,
  ];
  if (SEVERE_PATTERNS.some((p) => p.test(content))) score += 0.50;

  const MEDIUM_PATTERNS: RegExp[] = [
    // f-word in any form (fuck, fucking, fucked, fucker, wtf, etc.)
    /\bf[u*][c@][k](ing|ed|er|s|head|wit|face|wad)?\b/i,
    /\bwhat\s+the\s+f[u*][c@][k]\b/i,
    /\bwt[f]\b/i,
    // sh*t in any form
    /\bs[h]?[i!1][t]+\b/i,
    // a**hole / a**
    /\ba[s$][s$]\s*(hole|hat|wipe|clown|face)?\b/i,
    /\b(b[i!1]tch|bastard|prick|dick|cock|twat|wanker|tosser|douchebag)\b/i,
    /\b(go\s+to\s+hell|shut\s+up|get\s+lost)\b/i,
    /\b(you\s+(are\s+a?\s*)?(stupid|dumb|idiot|moron|retard|useless|worthless|incompetent))\b/i,
    /\b(trash|garbage|scum)\s+(station|place|location)\b/i,
    /\b(terrible|horrible|disgusting|despicable|pathetic)\s+(owner|staff|person|human)\b/i,
  ];
  if (MEDIUM_PATTERNS.some((p) => p.test(text))) score += 0.25;

  const allCapsRatio = (content.match(/[A-Z]/g) ?? []).length / Math.max(content.length, 1);
  if (allCapsRatio > 0.6 && content.length > 20) score += 0.10;

  const aggressivePunctuation = (content.match(/[!?]{3,}/g) ?? []).length;
  if (aggressivePunctuation >= 2) score += 0.05;

  return Math.min(Math.round(score * 100) / 100, 1.0);
}

/**
 * Screens review content for toxicity using a two-tier cascade:
 *
 * 1. HuggingFace toxic-bert (primary AI — requires HUGGINGFACE_API_KEY):
 *    BERT classifier trained on millions of toxic comments; returns a direct
 *    probability with no prompt engineering. Free tier: ~1,000 req/day.
 *
 * 2. Local regex scorer (fallback — always available, zero cost):
 *    Deterministic keyword/pattern matching. Used when HuggingFace is
 *    absent, quota-exhausted, or unreachable.
 *
 * Returns null only when BOTH paths fail unexpectedly, triggering graceful
 * degradation: review is approved and the community 3-flag system handles it.
 */
async function checkToxicity(content: string): Promise<number | null> {
  // Primary: HuggingFace toxic-bert
  if (config.HUGGINGFACE_API_KEY) {
    try {
      const quotaOk = await container.quotaService.check('huggingface');
      if (!quotaOk) {
        logger.warn('[reviews] HuggingFace daily quota reached — falling back to local scorer');
      } else {
        const score = await callHuggingFaceModerator(content);
        await container.quotaService.increment('huggingface');
        return score;
      }
    } catch (err) {
      logger.warn(
        `[reviews] HuggingFace moderation unavailable — falling back to local scorer: ${(err as Error).message}`,
      );
    }
  }

  // Fallback: local regex scorer — always available, deterministic, zero-cost
  try {
    return localToxicityScore(content);
  } catch (err) {
    logger.warn(`[reviews] Local scorer failed unexpectedly: ${err}`);
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
  // Only check active (non-deleted) reviews so deleted reviews don't block re-submission
  const existing = await Review.findOne({
    station:  new Types.ObjectId(stationId),
    author:   new Types.ObjectId(authorId),
    isActive: true,
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
    // If the review is auto-rejected by moderation, keep it stored but mark
    // it inactive so it doesn't block re-submission by the same author.
    isActive: moderationStatus !== 'rejected',
  });

  logger.info(`[reviews] Created review ${review._id} for station ${stationId} by user ${authorId} (toxicity: ${toxicityScore ?? 'skipped'}, status: ${moderationStatus})`);
  return review;
}

/** PUT /api/reviews/:id — update own review */
export async function updateReview(id: string, authorId: string, input: UpdateReviewInput): Promise<IReview> {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Review not found');

  const review = await Review.findOne({ _id: id, isActive: true });
  if (!review) throw ApiError.notFound('Review not found');

  if (review.author.toString() !== authorId) {
    throw ApiError.forbidden('You can only edit your own reviews');
  }

  if (input.rating !== undefined) review.rating = input.rating;
  if (input.title !== undefined) review.title = input.title;

  // Re-screen content for toxicity whenever the text changes.
  // An edited review may contain new harmful content not present in the original.
  if (input.content !== undefined) {
    review.content = input.content;

    const toxicityScore = await checkToxicity(input.content);
    if (toxicityScore !== null) {
      if (toxicityScore >= TOXICITY_AUTO_REJECT) {
        review.moderationStatus = 'rejected';
        review.isActive = false;
      } else if (toxicityScore >= TOXICITY_PENDING_THRESHOLD) {
        review.moderationStatus = 'pending';
      } else {
        // Clean update — restore to approved so it's visible again
        if (review.moderationStatus === 'pending') {
          review.moderationStatus = 'approved';
        }
      }
    }
  }

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

  if (input.moderationStatus === 'approved') {
    // Clear flag state so the review surfaces cleanly
    review.isFlagged = false;
    review.flaggedBy = [];
    review.flagCount = 0;
  } else if (input.moderationStatus === 'rejected') {
    // Mark inactive so the author can re-submit a corrected review.
    // Mirrors the auto-reject path in createReview (isActive: moderationStatus !== 'rejected').
    review.isActive = false;
  }

  await review.save();
  logger.info(`[reviews] Review ${id} moderated to "${input.moderationStatus}" by ${moderatorId}`);
  return review;
}
