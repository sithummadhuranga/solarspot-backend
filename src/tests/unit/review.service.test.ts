/**
 * Unit tests — ReviewService
 * Owner: Member 2
 *
 * Pattern mirrors station.service.test.ts — mocked models, no real DB.
 */

import { Types } from 'mongoose';
import axios from 'axios';
import * as reviewService from '@modules/reviews/review.service';
import { Review } from '@modules/reviews/review.model';
import { Station } from '@modules/stations/station.model';
import { container } from '@/container';

/* ── Mocks ──────────────────────────────────────────────────────────────────── */

jest.mock('@modules/users/user.model', () => ({}));

jest.mock('@modules/reviews/review.model', () => ({
  Review: {
    find:               jest.fn(),
    findOne:            jest.fn(),
    findById:           jest.fn(),
    findOneAndUpdate:   jest.fn(),
    create:             jest.fn(),
    countDocuments:     jest.fn(),
    aggregate:          jest.fn(),
  },
}));

jest.mock('@modules/stations/station.model', () => ({
  Station: {
    findOne:            jest.fn(),
    findByIdAndUpdate:  jest.fn(),
  },
}));

jest.mock('@utils/logger', () => ({
  __esModule: true,
  default: {
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    http:  jest.fn(),
  },
}));

// Perspective API quota is always exhausted in unit tests — no real HTTP calls made
jest.mock('@/container', () => ({
  container: {
    quotaService: {
      check:     jest.fn().mockResolvedValue(false),
      increment: jest.fn().mockResolvedValue(undefined),
    },
  },
}));

// Axios is explicitly mocked so tests can assert call arguments when quota allows it
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get:  jest.fn(),
  },
}));

jest.mock('@config/env', () => ({
  config: {
    PERSPECTIVE_API_KEY: 'test-key',
    NODE_ENV: 'test',
  },
}));

/* ── Test data ──────────────────────────────────────────────────────────────── */

const AUTHOR_ID    = new Types.ObjectId().toString();
const OTHER_ID     = new Types.ObjectId().toString();
const MOD_ID       = new Types.ObjectId().toString();
const STATION_ID   = new Types.ObjectId().toString();
const REVIEW_ID    = new Types.ObjectId().toString();

function makeMockReview(overrides: Record<string, unknown> = {}) {
  return {
    _id:              new Types.ObjectId(REVIEW_ID),
    station:          new Types.ObjectId(STATION_ID),
    author:           new Types.ObjectId(AUTHOR_ID),
    rating:           4,
    title:            'Great station',
    content:          'Really enjoyed charging here. Fast and reliable.',
    moderationStatus: 'approved' as const,
    isFlagged:        false,
    flaggedBy:        [] as Types.ObjectId[],
    flagCount:        0,
    helpfulVotes:     [] as Types.ObjectId[],
    helpfulCount:     0,
    isActive:         true,
    deletedAt:        null as Date | null,
    deletedBy:        null as Types.ObjectId | null,
    moderatedBy:      null as Types.ObjectId | null,
    moderatedAt:      null as Date | null,
    moderationNote:   null as string | null,
    save:             jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeMockStation(overrides: Record<string, unknown> = {}) {
  return {
    _id:         new Types.ObjectId(STATION_ID),
    name:        'Test Station',
    status:      'active',
    isActive:    true,
    submittedBy: new Types.ObjectId(OTHER_ID), // station belongs to OTHER_ID
    ...overrides,
  };
}

function makeChain(resolvedValue: unknown) {
  const chain: Record<string, jest.Mock> = {
    sort:     jest.fn(),
    skip:     jest.fn(),
    limit:    jest.fn(),
    select:   jest.fn(),
    populate: jest.fn(),
    lean:     jest.fn().mockResolvedValue(resolvedValue),
  };
  for (const key of ['sort', 'skip', 'limit', 'select', 'populate']) {
    chain[key].mockReturnValue(chain);
  }
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
});

/* ── createReview ───────────────────────────────────────────────────────────── */

describe('createReview', () => {
  const validInput = {
    station: STATION_ID,
    rating: 4,
    title: 'Great station',
    content: 'Really enjoyed charging here. Fast and reliable.',
  };

  it('creates a review for a valid, active station the user does not own', async () => {
    (Station.findOne as jest.Mock).mockResolvedValue(makeMockStation());
    (Review.findOne as jest.Mock).mockResolvedValue(null);
    const createdDoc = makeMockReview();
    (Review.create as jest.Mock).mockResolvedValue(createdDoc);

    const result = await reviewService.createReview(AUTHOR_ID, validInput);

    expect(Station.findOne).toHaveBeenCalledWith({ _id: STATION_ID, isActive: true, status: 'active' });
    expect(Review.findOne).toHaveBeenCalled();
    expect(Review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        station: expect.any(Types.ObjectId),
        author:  expect.any(Types.ObjectId),
        rating:  4,
        content: validInput.content,
        moderationStatus: 'approved',
      }),
    );
    expect(result).toBeDefined();
  });

  it('throws 409 if user already reviewed the station', async () => {
    (Station.findOne as jest.Mock).mockResolvedValue(makeMockStation());
    (Review.findOne as jest.Mock).mockResolvedValue(makeMockReview());

    await expect(
      reviewService.createReview(AUTHOR_ID, validInput),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(Review.create).not.toHaveBeenCalled();
  });

  it('throws 404 when station does not exist', async () => {
    (Station.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      reviewService.createReview(AUTHOR_ID, validInput),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 for an invalid station ObjectId', async () => {
    await expect(
      reviewService.createReview(AUTHOR_ID, { ...validInput, station: 'bad-id' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 when trying to review own station', async () => {
    // Station submitted by AUTHOR_ID
    (Station.findOne as jest.Mock).mockResolvedValue(
      makeMockStation({ submittedBy: new Types.ObjectId(AUTHOR_ID) }),
    );

    await expect(
      reviewService.createReview(AUTHOR_ID, validInput),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(Review.create).not.toHaveBeenCalled();
  });
});

/* ── getReviewById ──────────────────────────────────────────────────────────── */

describe('getReviewById', () => {
  it('returns the review document for a valid ObjectId', async () => {
    const reviewDoc = makeMockReview();
    const chain = makeChain(reviewDoc);
    (Review.findOne as jest.Mock).mockReturnValue(chain);

    const result = await reviewService.getReviewById(REVIEW_ID);

    expect(Review.findOne).toHaveBeenCalledWith({ _id: REVIEW_ID, isActive: true });
    expect(result).toEqual(reviewDoc);
  });

  it('throws 404 for an invalid ObjectId format', async () => {
    await expect(
      reviewService.getReviewById('not-valid'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 when review does not exist', async () => {
    const chain = makeChain(null);
    (Review.findOne as jest.Mock).mockReturnValue(chain);

    await expect(
      reviewService.getReviewById(REVIEW_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

/* ── updateReview ───────────────────────────────────────────────────────────── */

describe('updateReview', () => {
  it('allows author to update rating, title, and content', async () => {
    const reviewDoc = makeMockReview({ author: new Types.ObjectId(AUTHOR_ID) });
    (Review.findOne as jest.Mock).mockResolvedValue(reviewDoc);

    await reviewService.updateReview(REVIEW_ID, AUTHOR_ID, {
      rating: 5,
      title: 'Updated title',
      content: 'Updated content with enough characters.',
    });

    expect(reviewDoc.rating).toBe(5);
    expect(reviewDoc.title).toBe('Updated title');
    expect(reviewDoc.content).toBe('Updated content with enough characters.');
    expect(reviewDoc.save).toHaveBeenCalledTimes(1);
  });

  it('throws 403 if requester is not the author', async () => {
    const reviewDoc = makeMockReview({ author: new Types.ObjectId(AUTHOR_ID) });
    (Review.findOne as jest.Mock).mockResolvedValue(reviewDoc);

    await expect(
      reviewService.updateReview(REVIEW_ID, OTHER_ID, { rating: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(reviewDoc.save).not.toHaveBeenCalled();
  });

  it('throws 404 when review does not exist', async () => {
    (Review.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      reviewService.updateReview(REVIEW_ID, AUTHOR_ID, { rating: 3 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 for an invalid ObjectId', async () => {
    await expect(
      reviewService.updateReview('bad-id', AUTHOR_ID, { rating: 3 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

/* ── deleteReview ───────────────────────────────────────────────────────────── */

describe('deleteReview', () => {
  it('soft-deletes via findOneAndUpdate with isActive:false, deletedAt, deletedBy', async () => {
    const reviewDoc = makeMockReview({ author: new Types.ObjectId(AUTHOR_ID) });
    (Review.findOne as jest.Mock).mockResolvedValue(reviewDoc);
    (Review.findOneAndUpdate as jest.Mock).mockResolvedValue(reviewDoc);

    await reviewService.deleteReview(REVIEW_ID, AUTHOR_ID, false);

    expect(Review.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: REVIEW_ID },
      {
        $set: {
          isActive:  false,
          deletedAt: expect.any(Date),
          deletedBy: expect.any(Types.ObjectId),
        },
      },
    );
  });

  it('throws 403 when non-owner tries to delete without delete-any permission', async () => {
    const reviewDoc = makeMockReview({ author: new Types.ObjectId(AUTHOR_ID) });
    (Review.findOne as jest.Mock).mockResolvedValue(reviewDoc);

    await expect(
      reviewService.deleteReview(REVIEW_ID, OTHER_ID, false),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(Review.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('allows moderator to delete any review when canDeleteAny=true', async () => {
    const reviewDoc = makeMockReview({ author: new Types.ObjectId(AUTHOR_ID) });
    (Review.findOne as jest.Mock).mockResolvedValue(reviewDoc);
    (Review.findOneAndUpdate as jest.Mock).mockResolvedValue(reviewDoc);

    await reviewService.deleteReview(REVIEW_ID, MOD_ID, true);

    expect(Review.findOneAndUpdate).toHaveBeenCalled();
  });

  it('throws 404 when review does not exist', async () => {
    (Review.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      reviewService.deleteReview(REVIEW_ID, AUTHOR_ID, false),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 for invalid ObjectId', async () => {
    await expect(
      reviewService.deleteReview('bad-id', AUTHOR_ID, false),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

/* ── toggleHelpful ──────────────────────────────────────────────────────────── */

describe('toggleHelpful', () => {
  it('adds helpful vote when not already voted (returns action:added)', async () => {
    const reviewDoc = makeMockReview({
      author: new Types.ObjectId(OTHER_ID),
      helpfulVotes: [],
    });
    (Review.findOne as jest.Mock).mockResolvedValue(reviewDoc);
    (Review.findOneAndUpdate as jest.Mock).mockResolvedValue(reviewDoc);

    const result = await reviewService.toggleHelpful(REVIEW_ID, AUTHOR_ID);

    expect(result.action).toBe('added');
    expect(Review.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: REVIEW_ID },
      { $addToSet: { helpfulVotes: expect.any(Types.ObjectId) }, $inc: { helpfulCount: 1 } },
    );
  });

  it('removes helpful vote when already voted (returns action:removed)', async () => {
    const reviewDoc = makeMockReview({
      author: new Types.ObjectId(OTHER_ID),
      helpfulVotes: [new Types.ObjectId(AUTHOR_ID)],
    });
    (Review.findOne as jest.Mock).mockResolvedValue(reviewDoc);
    (Review.findOneAndUpdate as jest.Mock).mockResolvedValue(reviewDoc);

    const result = await reviewService.toggleHelpful(REVIEW_ID, AUTHOR_ID);

    expect(result.action).toBe('removed');
    expect(Review.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: REVIEW_ID },
      { $pull: { helpfulVotes: expect.any(Types.ObjectId) }, $inc: { helpfulCount: -1 } },
    );
  });

  it('throws 403 when trying to vote on own review', async () => {
    const reviewDoc = makeMockReview({ author: new Types.ObjectId(AUTHOR_ID) });
    (Review.findOne as jest.Mock).mockResolvedValue(reviewDoc);

    await expect(
      reviewService.toggleHelpful(REVIEW_ID, AUTHOR_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 404 when review does not exist', async () => {
    (Review.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      reviewService.toggleHelpful(REVIEW_ID, AUTHOR_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 for invalid ObjectId', async () => {
    await expect(
      reviewService.toggleHelpful('bad-id', AUTHOR_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

/* ── flagReview ─────────────────────────────────────────────────────────────── */

describe('flagReview', () => {
  it('flags a review and increments flagCount', async () => {
    const reviewDoc = makeMockReview({
      author: new Types.ObjectId(OTHER_ID),
      flaggedBy: [],
      flagCount: 0,
    });
    (Review.findOne as jest.Mock).mockResolvedValue(reviewDoc);
    (Review.findOneAndUpdate as jest.Mock).mockResolvedValue({ ...reviewDoc, flagCount: 1 });

    const result = await reviewService.flagReview(REVIEW_ID, AUTHOR_ID);

    expect(result.flagCount).toBe(1);
    expect(result.escalated).toBe(false);
    expect(Review.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: REVIEW_ID },
      {
        $addToSet: { flaggedBy: expect.any(Types.ObjectId) },
        $inc:      { flagCount: 1 },
        $set:      { isFlagged: true },
      },
      { new: true },
    );
  });

  it('auto-escalates moderationStatus to "flagged" when threshold is reached', async () => {
    // flagCount is already 2; adding one more hits the threshold of 3
    const reviewDoc = makeMockReview({
      author:    new Types.ObjectId(OTHER_ID),
      flaggedBy: [new Types.ObjectId(), new Types.ObjectId()],
      flagCount: 2,
    });
    (Review.findOne as jest.Mock).mockResolvedValue(reviewDoc);
    (Review.findOneAndUpdate as jest.Mock).mockResolvedValue({ ...reviewDoc, flagCount: 3 });

    const result = await reviewService.flagReview(REVIEW_ID, AUTHOR_ID);

    expect(result.escalated).toBe(true);
    // The $set payload must include the moderationStatus escalation
    const [[, updateArg]] = (Review.findOneAndUpdate as jest.Mock).mock.calls;
    expect(updateArg.$set).toMatchObject({ isFlagged: true, moderationStatus: 'flagged' });
  });

  it('throws 409 if user already flagged the review', async () => {
    const reviewDoc = makeMockReview({
      author: new Types.ObjectId(OTHER_ID),
      flaggedBy: [new Types.ObjectId(AUTHOR_ID)],
    });
    (Review.findOne as jest.Mock).mockResolvedValue(reviewDoc);

    await expect(
      reviewService.flagReview(REVIEW_ID, AUTHOR_ID),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 403 when trying to flag own review', async () => {
    const reviewDoc = makeMockReview({ author: new Types.ObjectId(AUTHOR_ID) });
    (Review.findOne as jest.Mock).mockResolvedValue(reviewDoc);

    await expect(
      reviewService.flagReview(REVIEW_ID, AUTHOR_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 404 when review does not exist', async () => {
    (Review.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      reviewService.flagReview(REVIEW_ID, AUTHOR_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

/* ── listReviews ────────────────────────────────────────────────────────────── */

describe('listReviews', () => {
  it('returns paginated result with default page/limit and approved filter', async () => {
    const mockDocs = [makeMockReview()];
    const chain = makeChain(mockDocs);
    (Review.find as jest.Mock).mockReturnValue(chain);
    (Review.countDocuments as jest.Mock).mockResolvedValue(1);

    const result = await reviewService.listReviews({});

    expect(Review.find).toHaveBeenCalledWith(expect.objectContaining({
      isActive: true,
      moderationStatus: 'approved',
    }));
    expect(result.reviews).toEqual(mockDocs);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.limit).toBe(10);
    expect(result.pagination.total).toBe(1);
  });

  it('filters by stationId when provided', async () => {
    (Review.find as jest.Mock).mockReturnValue(makeChain([]));
    (Review.countDocuments as jest.Mock).mockResolvedValue(0);

    await reviewService.listReviews({ stationId: STATION_ID });

    const [filterArg] = (Review.find as jest.Mock).mock.calls[0];
    expect(filterArg.station).toEqual(new Types.ObjectId(STATION_ID));
  });

  it('filters by moderationStatus when provided', async () => {
    (Review.find as jest.Mock).mockReturnValue(makeChain([]));
    (Review.countDocuments as jest.Mock).mockResolvedValue(0);

    await reviewService.listReviews({ moderationStatus: 'pending' });

    const [filterArg] = (Review.find as jest.Mock).mock.calls[0];
    expect(filterArg.moderationStatus).toBe('pending');
  });

  it('filters by authorId when provided', async () => {
    (Review.find as jest.Mock).mockReturnValue(makeChain([]));
    (Review.countDocuments as jest.Mock).mockResolvedValue(0);

    await reviewService.listReviews({ authorId: AUTHOR_ID });

    const [filterArg] = (Review.find as jest.Mock).mock.calls[0];
    expect(filterArg.author).toEqual(new Types.ObjectId(AUTHOR_ID));
  });

  it('throws 400 for invalid authorId format', async () => {
    await expect(
      reviewService.listReviews({ authorId: 'bad-id' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 for invalid stationId format', async () => {
    await expect(
      reviewService.listReviews({ stationId: 'bad-id' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('correctly calculates hasNext and hasPrev for middle pages', async () => {
    (Review.find as jest.Mock).mockReturnValue(makeChain([]));
    (Review.countDocuments as jest.Mock).mockResolvedValue(30);

    const result = await reviewService.listReviews({ page: 2, limit: 10 });

    expect(result.pagination.hasNext).toBe(true);
    expect(result.pagination.hasPrev).toBe(true);
    expect(result.pagination.totalPages).toBe(3);
  });
});

/* ── listFlaggedReviews ─────────────────────────────────────────────────────── */

describe('listFlaggedReviews', () => {
  it('returns paginated flagged reviews sorted by flagCount desc', async () => {
    const mockDocs = [makeMockReview({ isFlagged: true, flagCount: 3 })];
    const chain = makeChain(mockDocs);
    (Review.find as jest.Mock).mockReturnValue(chain);
    (Review.countDocuments as jest.Mock).mockResolvedValue(1);

    const result = await reviewService.listFlaggedReviews(1, 10);

    expect(Review.find).toHaveBeenCalledWith(expect.objectContaining({
      isFlagged: true,
      isActive: true,
    }));
    expect(result.reviews).toEqual(mockDocs);
    expect(result.pagination.total).toBe(1);
  });
});

/* ── listReviews — sort option branch coverage ──────────────────────────────── */

/**
 * buildSort() has 5 cases; the 'newest' and default paths are already exercised
 * by the main listReviews suite above. These parameterised cases ensure the
 * remaining switch branches (oldest, highest, lowest, helpful) are covered.
 */
describe('listReviews — sort option branches', () => {
  it.each([
    ['oldest',  { createdAt: 1 }],
    ['highest', { rating: -1, createdAt: -1 }],
    ['lowest',  { rating: 1,  createdAt: -1 }],
    ['helpful', { helpfulCount: -1, createdAt: -1 }],
  ] as const)(  // `as const` preserves literal types for the jest type inference
    'sort="%s" passes the correct sort document into Mongoose',
    async (sort, expectedSort) => {
      const chain = makeChain([]);
      (Review.find as jest.Mock).mockReturnValue(chain);
      (Review.countDocuments as jest.Mock).mockResolvedValue(0);

      await reviewService.listReviews({ sort });

      // The Mongoose query chain's .sort() must receive the expected sort document
      expect(chain.sort).toHaveBeenCalledWith(expectedSort);
    },
  );
});

/* ── moderateReview ─────────────────────────────────────────────────────────── */

describe('moderateReview', () => {
  it('sets moderationStatus to approved and records moderator details', async () => {
    const reviewDoc = makeMockReview({ moderationStatus: 'pending' });
    (Review.findOne as jest.Mock).mockResolvedValue(reviewDoc);

    await reviewService.moderateReview(REVIEW_ID, MOD_ID, {
      moderationStatus: 'approved',
      moderationNote: 'Content is appropriate',
    });

    expect(reviewDoc.moderationStatus).toBe('approved');
    expect((reviewDoc.moderatedBy as unknown as Types.ObjectId).toString()).toBe(MOD_ID);
    expect(reviewDoc.moderatedAt).toBeInstanceOf(Date);
    expect(reviewDoc.moderationNote).toBe('Content is appropriate');
    expect(reviewDoc.save).toHaveBeenCalledTimes(1);
  });

  it('sets moderationStatus to rejected', async () => {
    const reviewDoc = makeMockReview({ moderationStatus: 'flagged' });
    (Review.findOne as jest.Mock).mockResolvedValue(reviewDoc);

    await reviewService.moderateReview(REVIEW_ID, MOD_ID, {
      moderationStatus: 'rejected',
      moderationNote: 'Violates community guidelines',
    });

    expect(reviewDoc.moderationStatus).toBe('rejected');
    expect(reviewDoc.save).toHaveBeenCalledTimes(1);
  });

  it('clears flag state when approving a flagged review', async () => {
    const reviewDoc = makeMockReview({
      moderationStatus: 'flagged',
      isFlagged: true,
      flaggedBy: [new Types.ObjectId()],
      flagCount: 3,
    });
    (Review.findOne as jest.Mock).mockResolvedValue(reviewDoc);

    await reviewService.moderateReview(REVIEW_ID, MOD_ID, { moderationStatus: 'approved' });

    expect(reviewDoc.isFlagged).toBe(false);
    expect(reviewDoc.flaggedBy).toEqual([]);
    expect(reviewDoc.flagCount).toBe(0);
    expect(reviewDoc.save).toHaveBeenCalledTimes(1);
  });

  it('throws 404 when review does not exist', async () => {
    (Review.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      reviewService.moderateReview(REVIEW_ID, MOD_ID, { moderationStatus: 'approved' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 for invalid ObjectId', async () => {
    await expect(
      reviewService.moderateReview('bad-id', MOD_ID, { moderationStatus: 'approved' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

/* ── createReview — Perspective API toxicity scoring branches ────────────────── */

/**
 * These tests unlock the checkToxicity() code path by overriding the quota mock
 * to return `true` for one call, then providing controlled axios responses.
 * This covers lines that are otherwise unreachable in unit tests (quota always
 * returns false in the module-level mock).
 *
 * Mapping to coverage gaps:
 *  - score >= 0.80  → moderationStatus 'rejected'  (auto-reject branch)
 *  - score 0.60–0.79 → moderationStatus 'pending'   (human-review branch)
 *  - score < 0.60   → moderationStatus 'approved'   (auto-approve branch)
 *  - non-numeric    → toxicityScore omitted, approved by default
 *  - axios throws   → catch branch, approved by default
 */
describe('createReview — Perspective API toxicity scoring', () => {
  const toxicityInput = {
    station: STATION_ID,
    rating:  3,
    title:   'Toxicity test review',
    content: 'Really enjoyed charging here. Fast and reliable.',
  };

  /** Re-usable helper: sets up the station and duplicate-check mocks per test */
  function setupCreateMocks(): void {
    (Station.findOne as jest.Mock).mockResolvedValue(makeMockStation());
    (Review.findOne  as jest.Mock).mockResolvedValue(null);
  }

  it('auto-rejects review with moderationStatus "rejected" when Perspective score >= 0.80', async () => {
    // Allow quota for ONE call, then fall back to the module-level mock (false)
    (container.quotaService.check as jest.Mock).mockResolvedValueOnce(true);
    (container.quotaService.increment as jest.Mock).mockResolvedValueOnce(undefined);
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: { attributeScores: { TOXICITY: { summaryScore: { value: 0.85 } } } },
    });
    setupCreateMocks();
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview({ moderationStatus: 'rejected' }));

    await reviewService.createReview(AUTHOR_ID, toxicityInput);

    // Inspect what was actually passed to Review.create, not the resolved mock value
    const createArg = (Review.create as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(createArg.moderationStatus).toBe('rejected');
    expect(createArg.toxicityScore).toBe(0.85);
  });

  it('holds review as "pending" when Perspective score is >= 0.60 and < 0.80', async () => {
    (container.quotaService.check as jest.Mock).mockResolvedValueOnce(true);
    (container.quotaService.increment as jest.Mock).mockResolvedValueOnce(undefined);
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: { attributeScores: { TOXICITY: { summaryScore: { value: 0.70 } } } },
    });
    setupCreateMocks();
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview({ moderationStatus: 'pending' }));

    await reviewService.createReview(AUTHOR_ID, toxicityInput);

    const createArg = (Review.create as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(createArg.moderationStatus).toBe('pending');
    expect(createArg.toxicityScore).toBe(0.70);
  });

  it('auto-approves review when Perspective score < 0.60', async () => {
    (container.quotaService.check as jest.Mock).mockResolvedValueOnce(true);
    (container.quotaService.increment as jest.Mock).mockResolvedValueOnce(undefined);
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: { attributeScores: { TOXICITY: { summaryScore: { value: 0.25 } } } },
    });
    setupCreateMocks();
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview({ moderationStatus: 'approved' }));

    await reviewService.createReview(AUTHOR_ID, toxicityInput);

    const createArg = (Review.create as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(createArg.moderationStatus).toBe('approved');
    expect(createArg.toxicityScore).toBe(0.25);
  });

  it('omits toxicityScore and defaults to "approved" when API response has non-numeric value', async () => {
    (container.quotaService.check as jest.Mock).mockResolvedValueOnce(true);
    (container.quotaService.increment as jest.Mock).mockResolvedValueOnce(undefined);
    // Perspective occasionally returns null or string when the model is unavailable
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: { attributeScores: { TOXICITY: { summaryScore: { value: null } } } },
    });
    setupCreateMocks();
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview({ moderationStatus: 'approved' }));

    await reviewService.createReview(AUTHOR_ID, toxicityInput);

    const createArg = (Review.create as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(createArg.moderationStatus).toBe('approved');
    // checkToxicity() returns null → the spread omits toxicityScore
    expect(createArg.toxicityScore).toBeUndefined();
  });

  it('degrades gracefully and defaults to "approved" when Perspective API HTTP call fails', async () => {
    // Quota allows the call, but the network fails — checkToxicity enters the catch branch
    (container.quotaService.check as jest.Mock).mockResolvedValueOnce(true);
    (axios.post as jest.Mock).mockRejectedValueOnce(new Error('Simulated network timeout'));
    setupCreateMocks();
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview({ moderationStatus: 'approved' }));

    // createReview must NOT throw — Perspective failure is a soft degradation
    await expect(
      reviewService.createReview(AUTHOR_ID, toxicityInput),
    ).resolves.toBeDefined();

    const createArg = (Review.create as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    // catch block returns null → no toxicityScore field included, moderationStatus defaults to approved
    expect(createArg.moderationStatus).toBe('approved');
    expect(createArg.toxicityScore).toBeUndefined();
  });

  it('skips toxicity check and approves by default when PERSPECTIVE_API_KEY is not configured', async () => {
    // Temporarily remove the key to exercise the early-return branch in checkToxicity
    const configMod = jest.requireMock('@config/env') as { config: { PERSPECTIVE_API_KEY: string; NODE_ENV: string } };
    const savedKey = configMod.config.PERSPECTIVE_API_KEY;
    configMod.config.PERSPECTIVE_API_KEY = '';

    (container.quotaService.check as jest.Mock).mockResolvedValueOnce(true);
    setupCreateMocks();
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview({ moderationStatus: 'approved' }));

    try {
      await reviewService.createReview(AUTHOR_ID, toxicityInput);
    } finally {
      // Always restore key so this test does not bleed into subsequent tests
      configMod.config.PERSPECTIVE_API_KEY = savedKey;
    }

    const createArg = (Review.create as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(createArg.moderationStatus).toBe('approved');
    // axios.post must never be called when the key is missing
    expect(axios.post).not.toHaveBeenCalled();
  });
});
