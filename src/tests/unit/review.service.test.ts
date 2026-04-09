/**
 * Unit tests — ReviewService
 * Owner: Member 2
 *
 * Pattern mirrors station.service.test.ts — mocked models, no real DB.
 *
 * Toxicity scoring coverage:
 *   - HuggingFace AI path: global.fetch is mocked, config.HUGGINGFACE_API_KEY is set per-test
 *   - Local fallback: HUGGINGFACE_API_KEY absent (default test env), deterministic regex
 */

import { Types } from 'mongoose';
import * as reviewService from '@modules/reviews/review.service';
import { Review } from '@modules/reviews/review.model';
import { Station } from '@modules/stations/station.model';
import { config } from '@config/env';
import { container } from '@/container';

/* ── Mocks ──────────────────────────────────────────────────────────────────── */


jest.mock('@/container', () => ({
  container: {
    quotaService: {
      check:     jest.fn().mockResolvedValue(true),
      increment: jest.fn().mockResolvedValue(undefined),
    },
  },
}));

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

    expect(result.action).toBe('flagged');
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

  it('unflags the review when the user has already flagged it', async () => {
    const reviewDoc = makeMockReview({
      author:    new Types.ObjectId(OTHER_ID),
      flaggedBy: [new Types.ObjectId(AUTHOR_ID)],
      flagCount: 1,
      isFlagged: true,
    });
    (Review.findOne as jest.Mock).mockResolvedValue(reviewDoc);
    (Review.findOneAndUpdate as jest.Mock).mockResolvedValue({
      ...reviewDoc,
      flaggedBy: [],
      flagCount: 0,
      isFlagged: false,
    });

    const result = await reviewService.flagReview(REVIEW_ID, AUTHOR_ID);

    expect(result.action).toBe('unflagged');
    expect(result.flagCount).toBe(0);
    const updateArg = (Review.findOneAndUpdate as jest.Mock).mock.calls[0][1];
    expect(updateArg.$pull).toMatchObject({ flaggedBy: expect.any(Types.ObjectId) });
    expect(updateArg.$inc).toMatchObject({ flagCount: -1 });
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

/* ── createReview — HuggingFace AI moderation path ──────────────────────────── */

/**
 * These tests exercise the HuggingFace toxic-bert path inside checkToxicity.
 * global.fetch is mocked per-test. Each test temporarily sets
 * config.HUGGINGFACE_API_KEY to a non-empty value so the service takes the AI path.
 * The quota service mock always returns canCall=true by default.
 */
describe('createReview — HuggingFace AI moderation', () => {
  const hfInput = {
    station: STATION_ID,
    rating:  3,
    title:   'Test review',
    content: 'This is some review content for HuggingFace to evaluate.',
  };

  function setupCreateMocks(): void {
    (Station.findOne as jest.Mock).mockResolvedValue(makeMockStation());
    (Review.findOne  as jest.Mock).mockResolvedValue(null);
  }

  /**
   * Builds a fetch mock that returns the HuggingFace toxic-bert response shape:
   * [[{ label: 'toxic', score }, { label: 'non-toxic', score: 1-score }]]
   */
  function mockHFResponse(score: number): void {
    global.fetch = jest.fn().mockResolvedValue({
      ok:   true,
      json: async () => [[{ label: 'toxic', score }, { label: 'non-toxic', score: 1 - score }]],
      text: async () => '',
    });
  }

  function getCreateArg(): Record<string, unknown> {
    return (Review.create as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
  }

  beforeEach(() => {
    // Enable HuggingFace path for every test in this describe block
    config.HUGGINGFACE_API_KEY = 'test-hf-key';
  });

  afterEach(() => {
    // Reset so tests outside this block stay on the local scorer path
    config.HUGGINGFACE_API_KEY = '';
  });

  it('calls HuggingFace API and auto-rejects when toxic score >= 0.80', async () => {
    setupCreateMocks();
    mockHFResponse(0.92);
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview({ moderationStatus: 'rejected' }));

    await reviewService.createReview(AUTHOR_ID, hfInput);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('router.huggingface.co'),
      expect.any(Object),
    );
    const arg = getCreateArg();
    expect(arg.moderationStatus).toBe('rejected');
    expect(arg.toxicityScore).toBe(0.92);
  });

  it('holds review as pending when HuggingFace score is 0.60–0.79', async () => {
    setupCreateMocks();
    mockHFResponse(0.68);
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview({ moderationStatus: 'pending' }));

    await reviewService.createReview(AUTHOR_ID, hfInput);

    const arg = getCreateArg();
    expect(arg.moderationStatus).toBe('pending');
    expect(arg.toxicityScore).toBe(0.68);
  });

  it('auto-approves when HuggingFace score is below 0.60', async () => {
    setupCreateMocks();
    mockHFResponse(0.05);
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview({ moderationStatus: 'approved' }));

    await reviewService.createReview(AUTHOR_ID, hfInput);

    const arg = getCreateArg();
    expect(arg.moderationStatus).toBe('approved');
    expect(arg.toxicityScore).toBe(0.05);
  });

  it('increments HuggingFace quota after a successful API call', async () => {
    setupCreateMocks();
    mockHFResponse(0.1);
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview());

    await reviewService.createReview(AUTHOR_ID, hfInput);

    expect(container.quotaService.increment).toHaveBeenCalledWith('huggingface');
  });

  it('falls back to local scorer when HuggingFace fetch throws a network error', async () => {
    setupCreateMocks();
    global.fetch = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    // Clean content → local scorer returns 0 → approved
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview({ moderationStatus: 'approved' }));

    await reviewService.createReview(AUTHOR_ID, {
      ...hfInput,
      content: 'Great station, very fast charging.',
    });

    const arg = getCreateArg();
    // Local scorer ran (not HuggingFace), score=0, status=approved
    expect(arg.moderationStatus).toBe('approved');
    expect(arg.toxicityScore).toBe(0);
  });

  it('falls back to local scorer when HuggingFace quota is exhausted', async () => {
    setupCreateMocks();
    (container.quotaService.check as jest.Mock).mockResolvedValueOnce(false);
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview({ moderationStatus: 'approved' }));

    await reviewService.createReview(AUTHOR_ID, {
      ...hfInput,
      content: 'Reliable and well maintained station.',
    });

    // HuggingFace was skipped — fetch should not have been called
    expect(global.fetch).not.toHaveBeenCalled();
    const arg = getCreateArg();
    expect(arg.moderationStatus).toBe('approved');
  });
});

/* ── createReview — local toxicity scoring branches ─────────────────────────── */

/**
 * These tests exercise the local regex-based fallback scorer.
 * HUGGINGFACE_API_KEY is '' (not set) in the standard test environment,
 * so checkToxicity always takes the local path — no mocks needed.
 *
 * Score tiers (additive, capped at 1.0):
 *   Tier 1 — explicit threats      → +0.80
 *   Tier 2 — severe slurs/KYS      → +0.50
 *   Tier 3 — moderate profanity    → +0.25
 *   Tier 4 — structural signals    → up to +0.15
 *
 * Threshold mapping:
 *   score >= 0.80  → moderationStatus 'rejected'
 *   score 0.60–0.79 → moderationStatus 'pending'
 *   score < 0.60   → moderationStatus 'approved'
 */
describe('createReview — local toxicity scoring', () => {
  function setupCreateMocks(): void {
    (Station.findOne as jest.Mock).mockResolvedValue(makeMockStation());
    (Review.findOne  as jest.Mock).mockResolvedValue(null);
  }

  function getCreateArg(): Record<string, unknown> {
    return (Review.create as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
  }

  it('auto-rejects review containing explicit threat content (tier 1, score=0.80)', async () => {
    setupCreateMocks();
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview({ moderationStatus: 'rejected' }));

    await reviewService.createReview(AUTHOR_ID, {
      station: STATION_ID,
      rating:  1,
      title:   'Threat review',
      content: 'I will kill you',   // matches tier-1 threat pattern → +0.80
    });

    const arg = getCreateArg();
    expect(arg.moderationStatus).toBe('rejected');
    expect(arg.toxicityScore).toBe(0.8);
  });

  it('holds review as "pending" when content scores 0.60–0.79 (tier 2 + tier 3 = 0.75)', async () => {
    setupCreateMocks();
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview({ moderationStatus: 'pending' }));

    await reviewService.createReview(AUTHOR_ID, {
      station: STATION_ID,
      rating:  1,
      title:   'Borderline review',
      // tier2: "go kill yourself" (+0.50)  tier3: "you idiot" (+0.25)  = 0.75
      content: 'Go kill yourself you idiot',
    });

    const arg = getCreateArg();
    expect(arg.moderationStatus).toBe('pending');
    expect(arg.toxicityScore).toBe(0.75);
  });

  it('auto-approves clean review (score=0)', async () => {
    setupCreateMocks();
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview({ moderationStatus: 'approved' }));

    await reviewService.createReview(AUTHOR_ID, {
      station: STATION_ID,
      rating:  5,
      title:   'Great station',
      content: 'Really enjoyed charging here. Fast and reliable.',  // no tier hits → 0
    });

    const arg = getCreateArg();
    expect(arg.moderationStatus).toBe('approved');
    expect(arg.toxicityScore).toBe(0);
  });

  it('includes toxicityScore=0 in create args — not omitted when score is zero', async () => {
    // The spread `...(toxicityScore !== null && { toxicityScore })` evaluates `0 !== null`
    // as true, so toxicityScore=0 must be present (not undefined).
    setupCreateMocks();
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview());

    await reviewService.createReview(AUTHOR_ID, {
      station: STATION_ID,
      rating:  4,
      title:   'Normal review',
      content: 'Good experience overall, well maintained station.',
    });

    const arg = getCreateArg();
    expect(arg.toxicityScore).toBe(0);
    expect(arg.toxicityScore).not.toBeUndefined();
  });

  it('approves mild profanity alone — tier 3 only (score=0.25 < 0.60)', async () => {
    setupCreateMocks();
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview({ moderationStatus: 'approved' }));

    await reviewService.createReview(AUTHOR_ID, {
      station: STATION_ID,
      rating:  2,
      title:   'Mild language review',
      content: 'Fuck off this is a terrible station.',  // tier3 profanity only → 0.25
    });

    const arg = getCreateArg();
    expect(arg.moderationStatus).toBe('approved');
    expect(arg.toxicityScore).toBe(0.25);
  });

  it('approves all-caps structural signals alone — tier 4 (score < 0.60)', async () => {
    setupCreateMocks();
    (Review.create as jest.Mock).mockResolvedValue(makeMockReview({ moderationStatus: 'approved' }));

    // All-caps ratio > 0.6 with length > 20 → +0.10; aggressive punct (≥2 runs of 3+) → +0.05
    const shouted = 'THIS STATION WAS TERRIBLE AND I HATED IT!!!! WORST EXPERIENCE EVER!!!!!';
    await reviewService.createReview(AUTHOR_ID, {
      station: STATION_ID,
      rating:  1,
      title:   'Shouted review',
      content: shouted,
    });

    const arg = getCreateArg();
    expect(arg.moderationStatus).toBe('approved');
    expect(arg.toxicityScore as number).toBeGreaterThan(0);
    expect(arg.toxicityScore as number).toBeLessThan(0.60);
  });
});
