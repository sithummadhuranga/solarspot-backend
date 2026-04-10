/**
 * Integration tests — Review endpoints
 * Owner: Member 2
 *
 * Pattern mirrors stations.test.ts — MongoMemoryServer, supertest, JWT helpers.
 *
 * RBAC note: PermissionEngine.evaluate() is spied to return { allowed: true }
 * because the auth middleware provides role as a string ('user', 'moderator')
 * while the permission engine queries role_permissions by ObjectId reference.
 * Business-logic auth (ownership, self-vote, self-flag) lives in the SERVICE
 * layer and is fully exercised by these tests.
 *
 * Toxicity detection: uses the built-in local regex scorer (zero-cost, no network).
 * Clean test content scores 0 → approved by default in all create-review tests.
 */

import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';

import { container } from '@/container';
import app from '../../../app';
import { Station } from '@modules/stations/station.model';
import { Review }  from '@modules/reviews/review.model';

const JWT_SECRET = process.env.JWT_SECRET as string;

/* ── Identities ─────────────────────────────────────────────────────────────── */
const USER_A_ID     = new Types.ObjectId();   // regular user — will create reviews
const USER_B_ID     = new Types.ObjectId();   // another regular user
const STATION_OWNER = new Types.ObjectId();   // owns the test station
const MODERATOR_ID  = new Types.ObjectId();   // moderator role

function signToken(payload: { _id: string; role: string; email?: string }) {
  return `Bearer ${jwt.sign(
    { ...payload, email: payload.email ?? `${payload.role}@test.com`, isEmailVerified: true },
    JWT_SECRET,
    { expiresIn: '1h' },
  )}`;
}

const userAToken    = signToken({ _id: USER_A_ID.toString(),     role: 'user', email: 'usera@test.com' });
const userBToken    = signToken({ _id: USER_B_ID.toString(),     role: 'user', email: 'userb@test.com' });
const ownerToken    = signToken({ _id: STATION_OWNER.toString(), role: 'user', email: 'owner@test.com' });
const modToken      = signToken({ _id: MODERATOR_ID.toString(),  role: 'moderator' });

let mongoServer:    MongoMemoryServer;
let stationId:      string;      // active station owned by STATION_OWNER
let reviewAId:      string;      // review by USER_A
let reviewForDelete: string;     // review by USER_B — will be deleted
let reviewForFlag:  string;      // review by USER_B — will be flagged
let reviewForMod:   string;      // review by USER_A — for moderation (approve then reject)
let reviewForDeleteTest: string; // review by USER_A on a separate station — only used for 403 delete test

/* ── Before / After ─────────────────────────────────────────────────────────── */

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  await mongoose.connect(mongoServer.getUri(), { dbName: 'solarspot_review_test' });

  // Bypass RBAC permission engine — business-logic checks in service layer still apply
  jest.spyOn(container.permissionEngine, 'evaluate').mockResolvedValue({ allowed: true });

  // Build indexes
  await Station.init();
  await Review.init();

  // Create a station (active, approved) owned by STATION_OWNER
  const station = await Station.create({
    name:        'Test Solar Station',
    description: 'Integration test station',
    location:    { type: 'Point', coordinates: [79.86, 6.93] },
    address:     { city: 'Colombo', country: 'Sri Lanka', formattedAddress: 'Colombo' },
    submittedBy: STATION_OWNER,
    connectors:  [{ type: 'Type-2', powerKw: 7.4, count: 4 }],
    solarPanelKw: 15,
    status:      'active',
    isActive:    true,
  });
  stationId = station._id.toString();

  // Seed a review by USER_B for deletion test
  const rDel = await Review.create({
    station: station._id,
    author:  USER_B_ID,
    rating:  3,
    title:   'Decent station',
    content: 'Average experience, not bad but not great either.',
    moderationStatus: 'approved',
    isActive: true,
  });
  reviewForDelete = rDel._id.toString();

  // Need a second station so USER_B can have another review for flag testing
  const station2 = await Station.create({
    name:        'Test Station Two',
    submittedBy: STATION_OWNER,
    connectors:  [{ type: 'CCS', powerKw: 50, count: 2 }],
    solarPanelKw: 20,
    status:      'active',
    isActive:    true,
  });

  const rFlagDoc = await Review.create({
    station: station2._id,
    author:  USER_B_ID,
    rating:  2,
    title:   'Not impressed',
    content: 'Poor experience overall with very slow charging speeds.',
    moderationStatus: 'approved',
    isActive: true,
  });
  reviewForFlag = rFlagDoc._id.toString();

  // A third station + review by USER_A — kept permanently active so the
  // "403 — non-owner cannot delete" test always finds an active document,
  // regardless of what moderationStatus is applied to reviewForMod.
  const station4 = await Station.create({
    name:        'Delete Permission Test Station',
    submittedBy: STATION_OWNER,
    connectors:  [{ type: 'AC-Socket', powerKw: 2.3, count: 1 }],
    solarPanelKw: 3,
    status:      'active',
    isActive:    true,
  });
  const rDelTest = await Review.create({
    station: station4._id,
    author:  USER_A_ID,
    rating:  4,
    content: 'Good station for the area.',
    moderationStatus: 'approved',
    isActive: true,
  });
  reviewForDeleteTest = rDelTest._id.toString();
});

afterAll(async () => {
  jest.restoreAllMocks();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await mongoServer.stop();
});

/* ── POST /api/reviews ──────────────────────────────────────────────────────── */

describe('POST /api/reviews', () => {
  const validBody = {
    station: '', // filled in first test
    rating:  4,
    title:   'Excellent solar station',
    content: 'Very fast charging with reliable solar panels and great staff.',
  };

  it('201 — creates a review for a valid active station', async () => {
    validBody.station = stationId;
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', userAToken)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.rating).toBe(4);
    expect(res.body.data.moderationStatus).toBe('approved');

    reviewAId = res.body.data._id;
  });

  it('409 — duplicate review for the same station by the same user', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', userAToken)
      .send(validBody);

    expect(res.status).toBe(409);
  });

  it('401 — rejected without auth token', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .send(validBody);

    expect(res.status).toBe(401);
  });

  it('403 — station owner cannot review own station', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', ownerToken)
      .send(validBody);

    expect(res.status).toBe(403);
  });

  it('404 — station does not exist', async () => {
    const fakeStationId = new Types.ObjectId().toString();
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', userAToken)
      .send({ ...validBody, station: fakeStationId });

    expect(res.status).toBe(404);
  });

  it('422 — missing required content field', async () => {
    const { content: _, ...bodyWithout } = validBody;
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', userAToken)
      .send(bodyWithout);

    expect(res.status).toBe(422);
  });

  it('422 — rating above 5', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', userAToken)
      .send({ ...validBody, rating: 6 });

    expect(res.status).toBe(422);
  });

  it('422 — rating below 1', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', userAToken)
      .send({ ...validBody, rating: 0 });

    expect(res.status).toBe(422);
  });

  it('creates a review by USER_A for moderation test (setup)', async () => {
    // Need a third station for this review
    const station3 = await Station.create({
      name: 'Station For Moderation',
      submittedBy: STATION_OWNER,
      connectors: [{ type: 'AC-Socket', powerKw: 3.7, count: 2 }],
      solarPanelKw: 5,
      status: 'active',
      isActive: true,
    });

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', userAToken)
      .send({
        station: station3._id.toString(),
        rating:  1,
        title:   'Terrible',
        content: 'Worst experience ever, broken equipment and rude staff.',
      });

    expect(res.status).toBe(201);
    reviewForMod = res.body.data._id;
  });
});

/* ── GET /api/reviews ───────────────────────────────────────────────────────── */

describe('GET /api/reviews', () => {
  it('200 — returns paginated reviews', async () => {
    const res = await request(app).get('/api/reviews');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: expect.any(Number),
      total: expect.any(Number),
    });
  });

  it('200 — filters by stationId', async () => {
    const res = await request(app).get(`/api/reviews?stationId=${stationId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('200 — filters by authorId returns only that user\'s reviews', async () => {
    // First get the unfiltered total, then compare with U SER_A-only total.
    // We can't inspect review.author._id because User documents are not seeded in
    // this test DB — populate returns null. Instead we verify the count is smaller.
    const [allRes, filteredRes] = await Promise.all([
      request(app).get('/api/reviews'),
      request(app).get(`/api/reviews?authorId=${USER_A_ID.toString()}`),
    ]);

    expect(filteredRes.status).toBe(200);
    expect(Array.isArray(filteredRes.body.data)).toBe(true);
    expect(filteredRes.body.data.length).toBeGreaterThan(0);
    // USER_B also has reviews on other stations, so filtering must reduce total count
    expect(filteredRes.body.pagination.total).toBeLessThan(allRes.body.pagination.total);
  });

  it('422 — invalid authorId (non-ObjectId format) fails Joi validation', async () => {
    const res = await request(app).get('/api/reviews?authorId=not-valid-id');

    expect(res.status).toBe(422);
  });

  it('200 — returns empty for non-existent stationId', async () => {
    const fakeId = new Types.ObjectId().toString();
    const res = await request(app).get(`/api/reviews?stationId=${fakeId}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

/* ── GET /api/reviews/:id ───────────────────────────────────────────────────── */

describe('GET /api/reviews/:id', () => {
  it('200 — returns the review document', async () => {
    const res = await request(app).get(`/api/reviews/${reviewAId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(reviewAId);
  });

  it('404 — unknown ObjectId', async () => {
    const unknownId = new Types.ObjectId().toString();
    const res = await request(app).get(`/api/reviews/${unknownId}`);

    expect(res.status).toBe(404);
  });

  it('404 — invalid id format', async () => {
    const res = await request(app).get('/api/reviews/not-an-objectid');

    expect(res.status).toBe(404);
  });
});

/* ── PUT /api/reviews/:id ───────────────────────────────────────────────────── */

describe('PUT /api/reviews/:id', () => {
  it('200 — author can update rating and title', async () => {
    const res = await request(app)
      .put(`/api/reviews/${reviewAId}`)
      .set('Authorization', userAToken)
      .send({ rating: 5, title: 'Updated title here' });

    expect(res.status).toBe(200);
    expect(res.body.data.rating).toBe(5);
    expect(res.body.data.title).toBe('Updated title here');
  });

  it('403 — non-author cannot update another user\'s review', async () => {
    const res = await request(app)
      .put(`/api/reviews/${reviewAId}`)
      .set('Authorization', userBToken)
      .send({ rating: 1 });

    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app)
      .put(`/api/reviews/${reviewAId}`)
      .send({ rating: 3 });

    expect(res.status).toBe(401);
  });

  it('404 — unknown review', async () => {
    const unknownId = new Types.ObjectId().toString();
    const res = await request(app)
      .put(`/api/reviews/${unknownId}`)
      .set('Authorization', userAToken)
      .send({ rating: 3 });

    expect(res.status).toBe(404);
  });

  it('422 — empty body (requires at least one field)', async () => {
    const res = await request(app)
      .put(`/api/reviews/${reviewAId}`)
      .set('Authorization', userAToken)
      .send({});

    expect(res.status).toBe(422);
  });
});

/* ── POST /api/reviews/:id/helpful ──────────────────────────────────────────── */

describe('POST /api/reviews/:id/helpful', () => {
  it('200 — adds helpful vote', async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewForFlag}/helpful`)
      .set('Authorization', userAToken);

    expect(res.status).toBe(200);
    expect(res.body.data.action).toBe('added');
  });

  it('200 — toggles (removes) helpful vote on second call', async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewForFlag}/helpful`)
      .set('Authorization', userAToken);

    expect(res.status).toBe(200);
    expect(res.body.data.action).toBe('removed');
  });

  it('403 — cannot vote on own review', async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewAId}/helpful`)
      .set('Authorization', userAToken);

    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewAId}/helpful`);

    expect(res.status).toBe(401);
  });

  it('404 — unknown review', async () => {
    const unknownId = new Types.ObjectId().toString();
    const res = await request(app)
      .post(`/api/reviews/${unknownId}/helpful`)
      .set('Authorization', userAToken);

    expect(res.status).toBe(404);
  });
});

/* ── POST /api/reviews/:id/flag ─────────────────────────────────────────────── */

describe('POST /api/reviews/:id/flag', () => {
  it('200 — flags a review', async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewForFlag}/flag`)
      .set('Authorization', userAToken);

    expect(res.status).toBe(200);
    expect(res.body.data.flagCount).toBe(1);
  });

  it('200 — second call unflags (toggle behaviour)', async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewForFlag}/flag`)
      .set('Authorization', userAToken);

    expect(res.status).toBe(200);
    expect(res.body.data.action).toBe('unflagged');
    expect(res.body.data.flagCount).toBe(0);
  });

  it('200 — third call re-flags (restores state for flagged-list tests)', async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewForFlag}/flag`)
      .set('Authorization', userAToken);

    expect(res.status).toBe(200);
    expect(res.body.data.action).toBe('flagged');
    expect(res.body.data.flagCount).toBe(1);
  });

  it('403 — cannot flag own review', async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewAId}/flag`)
      .set('Authorization', userAToken);

    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewForFlag}/flag`);

    expect(res.status).toBe(401);
  });
});

/* ── GET /api/reviews/flagged ───────────────────────────────────────────────── */

describe('GET /api/reviews/flagged', () => {
  it('200 — authenticated user can list flagged reviews', async () => {
    const res = await request(app)
      .get('/api/reviews/flagged')
      .set('Authorization', modToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('401 — rejected without auth', async () => {
    const res = await request(app).get('/api/reviews/flagged');

    expect(res.status).toBe(401);
  });
});

/* ── PATCH /api/reviews/:id/moderate ────────────────────────────────────────── */

describe('PATCH /api/reviews/:id/moderate', () => {
  it('200 — moderator can approve a review', async () => {
    const res = await request(app)
      .patch(`/api/reviews/${reviewForMod}/moderate`)
      .set('Authorization', modToken)
      .send({ moderationStatus: 'approved', moderationNote: 'Content is fine' });

    expect(res.status).toBe(200);
    expect(res.body.data.moderationStatus).toBe('approved');
  });

  it('200 — moderator can reject a review', async () => {
    const res = await request(app)
      .patch(`/api/reviews/${reviewForMod}/moderate`)
      .set('Authorization', modToken)
      .send({ moderationStatus: 'rejected', moderationNote: 'Violates guidelines' });

    expect(res.status).toBe(200);
    expect(res.body.data.moderationStatus).toBe('rejected');
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app)
      .patch(`/api/reviews/${reviewForMod}/moderate`)
      .send({ moderationStatus: 'approved' });

    expect(res.status).toBe(401);
  });

  it('422 — missing moderationStatus fails validation', async () => {
    const res = await request(app)
      .patch(`/api/reviews/${reviewForMod}/moderate`)
      .set('Authorization', modToken)
      .send({});

    expect(res.status).toBe(422);
  });

  it('404 — unknown review', async () => {
    const unknownId = new Types.ObjectId().toString();
    const res = await request(app)
      .patch(`/api/reviews/${unknownId}/moderate`)
      .set('Authorization', modToken)
      .send({ moderationStatus: 'approved' });

    expect(res.status).toBe(404);
  });
});

/* ── DELETE /api/reviews/:id ────────────────────────────────────────────────── */

describe('DELETE /api/reviews/:id', () => {
  it('204 — author can soft-delete own review', async () => {
    const res = await request(app)
      .delete(`/api/reviews/${reviewForDelete}`)
      .set('Authorization', userBToken);

    expect(res.status).toBe(204);

    // Confirm subsequent GET returns 404
    const getRes = await request(app).get(`/api/reviews/${reviewForDelete}`);
    expect(getRes.status).toBe(404);
  });

  it('204 — moderator can delete any review (canDeleteAny)', async () => {
    // reviewAId belongs to USER_A; modToken is a moderator (roleLevel 3)
    const res = await request(app)
      .delete(`/api/reviews/${reviewAId}`)
      .set('Authorization', modToken);

    expect(res.status).toBe(204);

    // Verify the review is now gone
    const getRes = await request(app).get(`/api/reviews/${reviewAId}`);
    expect(getRes.status).toBe(404);
  });

  it('403 — non-owner cannot delete', async () => {
    // reviewForDeleteTest belongs to USER_A; userBToken is a different regular user.
    // This review is never rejected/moderated so it stays isActive:true for this test.
    const res = await request(app)
      .delete(`/api/reviews/${reviewForDeleteTest}`)
      .set('Authorization', userBToken);

    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated delete is rejected', async () => {
    const res = await request(app)
      .delete(`/api/reviews/${reviewForMod}`);

    expect(res.status).toBe(401);
  });

  it('404 — unknown review', async () => {
    const unknownId = new Types.ObjectId().toString();
    const res = await request(app)
      .delete(`/api/reviews/${unknownId}`)
      .set('Authorization', userAToken);

    expect(res.status).toBe(404);
  });
});

/* ── Pending review — full moderation flow ──────────────────────────────────── */

/**
 * These tests exercise the full lifecycle of a review that the AI toxicity
 * screener holds for human review (moderationStatus: 'pending').
 *
 * Content that reliably scores 0.75 via the local regex scorer:
 *   "kys fucking useless" → 0.50 (kys) + 0.25 (fucking) = 0.75 → pending
 *
 * Content that scores 0.80+ (auto-reject):
 *   "i will kill you right now" → THREAT_PATTERNS → +0.80 → rejected
 */
describe('Pending review — full moderation flow', () => {
  let pendingReviewId: string;
  let stationForPendingTests: string;

  // Create a dedicated station so pending-test reviews don't clash with earlier ones
  beforeAll(async () => {
    const station = await Station.create({
      name:        'Pending Test Station',
      description: 'Station for pending review moderation tests',
      location:    { type: 'Point', coordinates: [80.0, 7.0] },
      address:     { city: 'Kandy', country: 'Sri Lanka', formattedAddress: 'Kandy' },
      submittedBy: STATION_OWNER,
      connectors:  [{ type: 'USB-C', powerKw: 20, count: 2 }],
      solarPanelKw: 10,
      status:      'active',
      isActive:    true,
    });
    stationForPendingTests = station._id.toString();
  });

  it('201 — borderline-toxic content produces moderationStatus=pending', async () => {
    // "kys fucking useless" → local scorer: 0.50 (kys) + 0.25 (fucking) = 0.75 → pending
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', userAToken)
      .send({
        station: stationForPendingTests,
        rating:  2,
        title:   'Disappointed',
        content: 'kys fucking useless charging station, go kill yourself',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.moderationStatus).toBe('pending');
    // isActive stays true for pending (only rejected gets isActive: false)
    expect(res.body.data.isActive).toBe(true);

    pendingReviewId = res.body.data._id;
  });

  it('200 — pending review is NOT visible in the public approved list', async () => {
    const res = await request(app)
      .get(`/api/reviews?stationId=${stationForPendingTests}`);

    expect(res.status).toBe(200);
    // Default public listing only shows 'approved' reviews
    const ids = (res.body.data as Array<{ _id: string }>).map((r) => r._id);
    expect(ids).not.toContain(pendingReviewId);
  });

  it('200 — pending review IS visible when querying moderationStatus=pending', async () => {
    const res = await request(app)
      .get(`/api/reviews?moderationStatus=pending&stationId=${stationForPendingTests}`);

    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ _id: string }>).map((r) => r._id);
    expect(ids).toContain(pendingReviewId);
  });

  it('200 — moderator approves pending review; it becomes publicly visible', async () => {
    const approveRes = await request(app)
      .patch(`/api/reviews/${pendingReviewId}/moderate`)
      .set('Authorization', modToken)
      .send({ moderationStatus: 'approved', moderationNote: 'Content checked; context is acceptable' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.moderationStatus).toBe('approved');
    // Approve clears flag state
    expect(approveRes.body.data.isFlagged).toBe(false);

    // Verify: public listing now includes this review
    const listRes = await request(app)
      .get(`/api/reviews?stationId=${stationForPendingTests}`);

    expect(listRes.status).toBe(200);
    const ids = (listRes.body.data as Array<{ _id: string }>).map((r) => r._id);
    expect(ids).toContain(pendingReviewId);
  });

  it('200 — moderator rejects the now-approved review; it disappears from public list', async () => {
    const rejectRes = await request(app)
      .patch(`/api/reviews/${pendingReviewId}/moderate`)
      .set('Authorization', modToken)
      .send({ moderationStatus: 'rejected', moderationNote: 'Re-reviewing — content violates guidelines' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.moderationStatus).toBe('rejected');
    // Reject makes the review inactive
    expect(rejectRes.body.data.isActive).toBe(false);

    // Verify: public listing no longer includes this review
    const listRes = await request(app)
      .get(`/api/reviews?stationId=${stationForPendingTests}`);

    expect(listRes.status).toBe(200);
    const ids = (listRes.body.data as Array<{ _id: string }>).map((r) => r._id);
    expect(ids).not.toContain(pendingReviewId);
  });

  it('200 — after rejection author can submit a new corrected review (compound unique lifted)', async () => {
    // The rejected review has isActive:false so the partial unique index allows re-submission
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', userAToken)
      .send({
        station: stationForPendingTests,
        rating:  3,
        title:   'Revised opinion',
        content: 'Actually a decent station once you get past the poor signage.',
      });

    // Clean content → auto-approved
    expect(res.status).toBe(201);
    expect(res.body.data.moderationStatus).toBe('approved');
  });
});

/* ── Auto-reject — severe toxic content ─────────────────────────────────────── */

describe('Auto-reject — severely toxic content at creation', () => {
  let autoRejectStationId: string;

  beforeAll(async () => {
    const station = await Station.create({
      name:        'Auto-Reject Test Station',
      submittedBy: STATION_OWNER,
      connectors:  [{ type: 'CCS', powerKw: 50, count: 1 }],
      solarPanelKw: 5,
      status:      'active',
      isActive:    true,
    });
    autoRejectStationId = station._id.toString();
  });

  it('201 — content with threat triggers auto-reject; review stored as isActive:false', async () => {
    // THREAT_PATTERNS → +0.80 → moderationStatus:'rejected', isActive:false
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', userBToken)
      .send({
        station: autoRejectStationId,
        rating:  1,
        content: 'i will kill you right now, this station is dangerous',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.moderationStatus).toBe('rejected');
    expect(res.body.data.isActive).toBe(false);
  });

  it('201 — author can re-submit after auto-reject (isActive:false lifts the unique index)', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', userBToken)
      .send({
        station: autoRejectStationId,
        rating:  2,
        content: 'The station is okay but very poorly maintained.',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.moderationStatus).toBe('approved');
  });

  it('200 — auto-rejected review does NOT appear in public approved listing', async () => {
    const res = await request(app)
      .get(`/api/reviews?stationId=${autoRejectStationId}&moderationStatus=rejected`);

    expect(res.status).toBe(200);
    // The rejected review exists in DB but with isActive:false → listReviews filter isActive:true hides it
    expect(res.body.data).toHaveLength(0);
  });
});

/* ── Community flag auto-escalation ─────────────────────────────────────────── */

describe('Community flag — auto-escalation to flagged status', () => {
  let escalateReviewId: string;
  let _escalateStationId: string;

  const userC = new Types.ObjectId();
  const userD = new Types.ObjectId();
  const tokenC = signToken({ _id: userC.toString(), role: 'user', email: 'userc@test.com' });
  const tokenD = signToken({ _id: userD.toString(), role: 'user', email: 'userd@test.com' });

  beforeAll(async () => {
    const station = await Station.create({
      name:        'Escalation Test Station',
      submittedBy: STATION_OWNER,
      connectors:  [{ type: 'Type-2', powerKw: 7.4, count: 2 }],
      solarPanelKw: 8,
      status:      'active',
      isActive:    true,
    });
    _escalateStationId = station._id.toString();

    const review = await Review.create({
      station:          station._id,
      author:           USER_A_ID,
      rating:           1,
      title:            'Borderline review',
      content:          'This might be flagged by the community.',
      moderationStatus: 'approved',
      isActive:         true,
    });
    escalateReviewId = review._id.toString();
  });

  it('200 — first flag: flagCount=1, status stays approved', async () => {
    const res = await request(app)
      .post(`/api/reviews/${escalateReviewId}/flag`)
      .set('Authorization', userBToken);

    expect(res.status).toBe(200);
    expect(res.body.data.flagCount).toBe(1);
    expect(res.body.data.escalated).toBe(false);
  });

  it('200 — second flag: flagCount=2, status stays approved', async () => {
    const res = await request(app)
      .post(`/api/reviews/${escalateReviewId}/flag`)
      .set('Authorization', tokenC);

    expect(res.status).toBe(200);
    expect(res.body.data.flagCount).toBe(2);
    expect(res.body.data.escalated).toBe(false);
  });

  it('200 — third flag: flagCount=3, review auto-escalates to flagged status', async () => {
    const res = await request(app)
      .post(`/api/reviews/${escalateReviewId}/flag`)
      .set('Authorization', tokenD);

    expect(res.status).toBe(200);
    expect(res.body.data.flagCount).toBe(3);
    // Auto-escalation triggers at FLAG_AUTO_ESCALATE_THRESHOLD (3)
    expect(res.body.data.escalated).toBe(true);
  });

  it('200 — escalated review appears in the flagged list', async () => {
    const res = await request(app)
      .get('/api/reviews/flagged')
      .set('Authorization', modToken);

    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ _id: string }>).map((r) => r._id);
    expect(ids).toContain(escalateReviewId);
  });

  it('200 — moderator approves escalated review; it leaves the flagged queue', async () => {
    const res = await request(app)
      .patch(`/api/reviews/${escalateReviewId}/moderate`)
      .set('Authorization', modToken)
      .send({ moderationStatus: 'approved', moderationNote: 'No violation found' });

    expect(res.status).toBe(200);
    expect(res.body.data.moderationStatus).toBe('approved');
    // Flag state is cleared on approval
    expect(res.body.data.isFlagged).toBe(false);
    expect(res.body.data.flagCount).toBe(0);

    // Verify it no longer appears in the flagged queue
    const flaggedRes = await request(app)
      .get('/api/reviews/flagged')
      .set('Authorization', modToken);

    const ids = (flaggedRes.body.data as Array<{ _id: string }>).map((r) => r._id);
    expect(ids).not.toContain(escalateReviewId);
  });
});
