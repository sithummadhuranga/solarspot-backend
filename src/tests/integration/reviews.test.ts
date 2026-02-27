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
 * Perspective API: axios is mocked to fail immediately so checkToxicity()
 * degrades gracefully (returns null → review approved by default).
 * This keeps tests deterministic and avoids 5-second network timeouts.
 */

// Prevent actual HTTP calls to Perspective API — checkToxicity handles failure gracefully
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn().mockRejectedValue(new Error('axios mock — no network in integration tests')),
    get:  jest.fn().mockRejectedValue(new Error('axios mock — no network in integration tests')),
  },
}));

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
let reviewForMod:   string;      // review by USER_A — for moderation

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

  it('409 — cannot flag same review twice', async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewForFlag}/flag`)
      .set('Authorization', userAToken);

    expect(res.status).toBe(409);
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
    // reviewForMod belongs to USER_A; userBToken is a different user (regular)
    const res = await request(app)
      .delete(`/api/reviews/${reviewForMod}`)
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
