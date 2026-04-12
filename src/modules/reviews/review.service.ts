

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



const TOXICITY_AUTO_REJECT = 0.80;


const TOXICITY_PENDING_THRESHOLD = 0.60;


const FLAG_AUTO_ESCALATE_THRESHOLD = 3;
const DUPLICATE_REVIEW_MESSAGE = 'You have already reviewed this station. Edit or delete your existing review before posting a new one.';

type DuplicateKeyError = Error & {
  code?: number;
  keyPattern?: Record<string, unknown>;
};

function isDuplicateKeyError(error: unknown): error is DuplicateKeyError {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === 11000;
}

function isReviewDuplicateKeyError(error: unknown): boolean {
  if (!isDuplicateKeyError(error)) {
    return false;
  }

  const keyPattern = error.keyPattern;
  if (!keyPattern || Object.keys(keyPattern).length === 0) {
    return true;
  }

  return 'station' in keyPattern && 'author' in keyPattern;
}

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

  if (typeof responseData === 'object' && responseData !== null && 'error' in responseData) {
    const errObj = responseData as { error: string; estimated_time?: number };
    throw new Error(
      `HuggingFace model not ready: ${errObj.error} (est. ${errObj.estimated_time ?? '?'}s)`,
    );
  }

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


function localToxicityScore(content: string): number {
  let score = 0;
  const text = content.toLowerCase();

  const THREAT_PATTERNS: RegExp[] = [
    /\b(kill|murder|shoot|stab|rape|strangle)\s+(you|him|her|them|u)\b/i,
    /\b(kill|murder|shoot|stab|strangle)\s+the\s+\w+/i,
    /\bi\s+(will|am going to|gonna|shall)\s+(kill|hurt|destroy|harm|attack)\b/i,
    /\byou('re| are| will be)\s+(going to\s+)?(die|dead|finished)\b/i,
    /\bi\s+know\s+where\s+you\s+live\b/i,
    /\b(death|bomb|shooting)\s+threat\b/i,
  ];
  if (THREAT_PATTERNS.some((p) => p.test(content))) score += 0.80;

  const SEVERE_PATTERNS: RegExp[] = [
    /\bn[i!1][g9][g9][ae3]r+\b/i,
    /\bf[a@4][g9][g9][o0]+t+\b/i,
    /\bc[u*][n][t]+\b/i,
    /\b(go\s+kill\s+yourself|kys)\b/i,
    /\b(subhuman|vermin|parasite)\s+(race|people|community)\b/i,
  ];
  if (SEVERE_PATTERNS.some((p) => p.test(content))) score += 0.50;

  const MEDIUM_PATTERNS: RegExp[] = [
    /\bf[u*][c@][k](ing|ed|er|s|head|wit|face|wad)?\b/i,
    /\bwhat\s+the\s+f[u*][c@][k]\b/i,
    /\bwt[f]\b/i,
    /\bs[h]?[i!1][t]+\b/i,
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


async function checkToxicity(content: string): Promise<number | null> {
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

  try {
    return localToxicityScore(content);
  } catch (err) {
    logger.warn(`[reviews] Local scorer failed unexpectedly: ${err}`);
    return null;
  }
}



export async function listReviews(query: ListReviewsQuery) {
  const { page = 1, limit = 10, stationId, authorId, moderationStatus, sort = 'newest' } = query;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { isActive: true };

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


export async function createReview(authorId: string, input: CreateReviewInput): Promise<IReview> {
  const { station: stationId, rating, title, content } = input;

  if (!Types.ObjectId.isValid(stationId)) {
    throw ApiError.notFound('Station not found');
  }

  const station = await Station.findOne({ _id: stationId, isActive: true, status: 'active' });
  if (!station) {
    throw ApiError.notFound('Station not found or not yet approved');
  }

  if (station.submittedBy.toString() === authorId) {
    throw ApiError.forbidden('You cannot review your own station');
  }

  const existing = await Review.findOne({
    station:  new Types.ObjectId(stationId),
    author:   new Types.ObjectId(authorId),
    isActive: true,
  });
  if (existing) {
    throw ApiError.conflict(DUPLICATE_REVIEW_MESSAGE);
  }

  const textToScreen = [title?.trim(), content].filter(Boolean).join('\n\n');
  const toxicityScore = await checkToxicity(textToScreen);

  let moderationStatus: 'approved' | 'pending' | 'rejected' = 'approved';
  if (toxicityScore !== null) {
    if (toxicityScore >= TOXICITY_AUTO_REJECT) {
      moderationStatus = 'rejected';
    } else if (toxicityScore >= TOXICITY_PENDING_THRESHOLD) {
      moderationStatus = 'pending';
    }
  }

  let review: IReview;
  try {
    review = await Review.create({
      station:          new Types.ObjectId(stationId),
      author:           new Types.ObjectId(authorId),
      rating,
      title:            title?.trim() || undefined,
      content,
      moderationStatus,
      ...(toxicityScore !== null && { toxicityScore }),
      isActive: moderationStatus !== 'rejected',
    });
  } catch (error) {
    if (isReviewDuplicateKeyError(error)) {
      throw ApiError.conflict(DUPLICATE_REVIEW_MESSAGE);
    }
    throw error;
  }

  logger.info(`[reviews] Created review ${review._id} for station ${stationId} by user ${authorId} (toxicity: ${toxicityScore ?? 'skipped'}, status: ${moderationStatus})`);
  return review;
}


export async function updateReview(id: string, authorId: string, input: UpdateReviewInput): Promise<IReview> {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Review not found');

  const review = await Review.findOne({ _id: id, isActive: true });
  if (!review) throw ApiError.notFound('Review not found');

  if (review.author.toString() !== authorId) {
    throw ApiError.forbidden('You can only edit your own reviews');
  }

  if (input.rating !== undefined) review.rating = input.rating;

  const textChanged = input.title !== undefined || input.content !== undefined;
  if (input.title   !== undefined) review.title   = input.title;
  if (input.content !== undefined) review.content = input.content;

  if (textChanged) {
    const textToScreen = [review.title, review.content].filter(Boolean).join('\n\n');
    const toxicityScore = await checkToxicity(textToScreen);
    if (toxicityScore !== null) {
      if (toxicityScore >= TOXICITY_AUTO_REJECT) {
        review.moderationStatus = 'rejected';
        review.isActive = false;
      } else if (toxicityScore >= TOXICITY_PENDING_THRESHOLD) {
        review.moderationStatus = 'pending';
      } else {
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


export async function deleteReview(id: string, requesterId: string, canDeleteAny: boolean): Promise<void> {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Review not found');

  const review = await Review.findOne({ _id: id, isActive: true });
  if (!review) throw ApiError.notFound('Review not found');

  if (!canDeleteAny && review.author.toString() !== requesterId) {
    throw ApiError.forbidden('You can only delete your own reviews');
  }

  await Review.findOneAndUpdate(
    { _id: id },
    { $set: { isActive: false, deletedAt: new Date(), deletedBy: new Types.ObjectId(requesterId) } },
  );

  logger.info(`[reviews] Soft-deleted review ${id} by user ${requesterId}`);
}


export async function toggleHelpful(id: string, userId: string) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Review not found');

  const review = await Review.findOne({ _id: id, isActive: true, moderationStatus: 'approved' });
  if (!review) throw ApiError.notFound('Review not found');

  if (review.author.toString() === userId) {
    throw ApiError.forbidden('You cannot mark your own review as helpful');
  }

  const userOid = new Types.ObjectId(userId);
  const alreadyVoted = review.helpfulVotes.some((v) => v.toString() === userId);

  if (alreadyVoted) {
    await Review.findOneAndUpdate(
      { _id: id },
      { $pull: { helpfulVotes: userOid }, $inc: { helpfulCount: -1 } },
    );
    logger.info(`[reviews] User ${userId} removed helpful vote from review ${id}`);
    return { action: 'removed' as const };
  } else {
    await Review.findOneAndUpdate(
      { _id: id },
      { $addToSet: { helpfulVotes: userOid }, $inc: { helpfulCount: 1 } },
    );
    logger.info(`[reviews] User ${userId} added helpful vote to review ${id}`);
    return { action: 'added' as const };
  }
}


export async function flagReview(id: string, userId: string) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Review not found');

  const review = await Review.findOne({ _id: id, isActive: true });
  if (!review) throw ApiError.notFound('Review not found');

  if (review.author.toString() === userId) {
    throw ApiError.forbidden('You cannot flag your own review');
  }

  const userOid = new Types.ObjectId(userId);
  const alreadyFlagged = review.flaggedBy.some((f) => f.toString() === userId);

  if (alreadyFlagged) {
    const newFlagCount = Math.max(0, review.flagCount - 1);
    const unflagged = await Review.findOneAndUpdate(
      { _id: id },
      {
        $pull: { flaggedBy: userOid },
        $inc:  { flagCount: -1 },
        $set:  { isFlagged: newFlagCount > 0 },
      },
      { new: true },
    );
    logger.info(`[reviews] User ${userId} removed flag from review ${id} (flagCount: ${unflagged?.flagCount})`);
    return { action: 'unflagged' as const, flagCount: unflagged?.flagCount ?? 0, escalated: false };
  }

  const newFlagCount = review.flagCount + 1;

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
  return { action: 'flagged' as const, flagCount: updated?.flagCount ?? 0, escalated: shouldEscalate };
}


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


export async function moderateReview(id: string, moderatorId: string, input: ModerateReviewInput): Promise<IReview> {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Review not found');

  const review = await Review.findOne({ _id: id, isActive: true });
  if (!review) throw ApiError.notFound('Review not found');

  review.moderationStatus = input.moderationStatus;
  review.moderatedBy = new Types.ObjectId(moderatorId);
  review.moderatedAt = new Date();
  review.moderationNote = input.moderationNote ?? undefined;

  if (input.moderationStatus === 'approved') {
    review.isFlagged = false;
    review.flaggedBy = [];
    review.flagCount = 0;
  } else if (input.moderationStatus === 'rejected') {
    review.isActive = false;
  }

  await review.save();
  logger.info(`[reviews] Review ${id} moderated to "${input.moderationStatus}" by ${moderatorId}`);
  return review;
}
