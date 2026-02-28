import request from 'supertest';
import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';

import { container } from '@/container';
import app from '../../../app';
import { Station } from '@modules/stations/station.model';
import { connectTestDb, disconnectTestDb, seedCore } from './helpers';

jest.mock('@utils/geocoder', () => ({
  forwardGeocode: jest.fn().mockResolvedValue(null),
  reverseGeocode: jest.fn().mockResolvedValue(null),
  NominatimGeocoder: jest.fn(),
}));

const JWT_SECRET = process.env.JWT_SECRET as string;

const USER_ID       = new Types.ObjectId();
const OTHER_USER_ID = new Types.ObjectId();
const MODERATOR_ID  = new Types.ObjectId();

function signToken(payload: {
  _id: string;
  role: 'user' | 'moderator' | 'admin';
  email?: string;
}) {
  return `Bearer ${jwt.sign(
    { ...payload, email: payload.email ?? `${payload.role}@test.com`, isEmailVerified: true },
    JWT_SECRET,
    { expiresIn: '1h' },
  )}`;
}

const userToken      = signToken({ _id: USER_ID.toString(),       role: 'user' });
const _otherUserToken = signToken({ _id: OTHER_USER_ID.toString(), role: 'user', email: 'other@test.com' });
const modToken       = signToken({ _id: MODERATOR_ID.toString(),  role: 'moderator' });

let activeStationId:   string;
let pendingStationId:  string;
let featureStationId:  string;
let deleteStationId:   string;
let otherStationId:    string;

beforeAll(async () => {
  await connectTestDb();
  await seedCore();

  // Bypass the RBAC permission engine — these test JWT tokens embed slug strings
  // ('moderator') rather than ObjectIds, so the real engine would find no role
  // permissions. We replicate the correct RBAC outcome: moderator-only actions
  // are denied for 'user' role tokens; everything else is allowed.
  const MOD_ONLY_PERMS = new Set([
    'stations.read-pending',
    'stations.approve',
    'stations.reject',
    'stations.feature',
  ]);
  jest.spyOn(container.permissionEngine, 'evaluate').mockImplementation(
    async (user: { role: string }, action: string) => {
      if (MOD_ONLY_PERMS.has(action) && user.role !== 'moderator' && user.role !== 'admin') {
        return { allowed: false, reason: 'Insufficient role' };
      }
      return { allowed: true };
    },
  );

  await Station.init();
  const [s1, s2, s3, s4, s5] = await Station.insertMany([
    {
      name:        'Colombo Solar Hub',
      description: 'Active solar charging station near Galle Rd',
      location:    { type: 'Point', coordinates: [79.8612, 6.9271] },
      address:     { city: 'Colombo', country: 'Sri Lanka', formattedAddress: 'Galle Rd, Colombo, Sri Lanka' },
      submittedBy: USER_ID,
      connectors:  [{ type: 'Type-2', powerKw: 7.4, count: 4 }],
      solarPanelKw: 15,
      amenities:   ['wifi', 'parking'],
      status:      'active',
      isActive:    true,
    },
    {
      name:        'Kandy Solar Post',
      submittedBy: USER_ID,
      connectors:  [{ type: 'CCS', powerKw: 50, count: 2 }],
      solarPanelKw: 20,
      status:      'pending',
      isActive:    true,
    },
    {
      name:        'Galle Solar Spot',
      submittedBy: USER_ID,
      connectors:  [{ type: 'AC-Socket', powerKw: 3.7, count: 6 }],
      solarPanelKw: 8,
      status:      'active',
      isActive:    true,
      isFeatured:  false,
    },
    {
      name:        'Matara Solar Base',
      submittedBy: USER_ID,
      connectors:  [{ type: 'CHAdeMO', powerKw: 44, count: 1 }],
      solarPanelKw: 12,
      status:      'active',
      isActive:    true,
    },
    {
      name:        'Jaffna Solar Node',
      submittedBy: OTHER_USER_ID,
      connectors:  [{ type: 'Tesla-NACS', powerKw: 250, count: 2 }],
      solarPanelKw: 30,
      status:      'active',
      isActive:    true,
    },
  ]);

  activeStationId  = s1._id.toString();
  pendingStationId = s2._id.toString();
  featureStationId = s3._id.toString();
  deleteStationId  = s4._id.toString();
  otherStationId   = s5._id.toString();
});

afterAll(async () => {
  jest.restoreAllMocks();
  await disconnectTestDb();
});

describe('GET /api/stations', () => {
  it('200 — returns success:true with a paginated stations array', async () => {
    const res = await request(app).get('/api/stations');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toMatchObject({
      page: 1, limit: expect.any(Number), total: expect.any(Number),
    });
  });

  it('200 — filters by connectorType query param', async () => {
    const res = await request(app).get('/api/stations?connectorType=Type-2');

    expect(res.status).toBe(200);
    const types = (res.body.data as Array<{ connectors: Array<{ type: string }> }>)
      .flatMap(s => s.connectors.map(c => c.type));
    types.forEach(t => expect(t).toBe('Type-2'));
  });

  it('200 — filters by minRating (returns empty when minRating=5)', async () => {
    const res = await request(app).get('/api/stations?minRating=5');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('422 — rejects non-numeric page parameter', async () => {
    const res = await request(app).get('/api/stations?page=abc');

    expect(res.status).toBe(422);
  });
});

describe('GET /api/stations/nearby', () => {
  it('200 — returns stations with distanceKm field near Colombo', async () => {
    const res = await request(app)
      .get('/api/stations/nearby?lat=6.9271&lng=79.8612&radius=50');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    if ((res.body.data as Array<unknown>).length > 0) {
      expect((res.body.data[0] as { distanceKm: number }).distanceKm).toBeDefined();
    }
  });

  it('422 — missing lat parameter fails validation', async () => {
    const res = await request(app).get('/api/stations/nearby?lng=79.8612');

    expect(res.status).toBe(422);
  });

  it('422 — missing lng parameter fails validation', async () => {
    const res = await request(app).get('/api/stations/nearby?lat=6.9271');

    expect(res.status).toBe(422);
  });
});

describe('GET /api/stations/search', () => {
  it('200 — returns result array for a search query', async () => {
    const res = await request(app).get('/api/stations/search?q=Colombo');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('422 — missing q parameter fails validation', async () => {
    const res = await request(app).get('/api/stations/search');

    expect(res.status).toBe(422);
  });
});

describe('GET /api/stations/pending', () => {
  it('200 — moderator can retrieve pending stations list', async () => {
    const res = await request(app)
      .get('/api/stations/pending')
      .set('Authorization', modToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    const statuses = (res.body.data as Array<{ status: string }>).map(s => s.status);
    statuses.forEach(status => expect(status).toBe('pending'));
  });

  it('401 — rejected without an Authorization token', async () => {
    const res = await request(app).get('/api/stations/pending');

    expect(res.status).toBe(401);
  });

  it('403 — plain user role is forbidden', async () => {
    const res = await request(app)
      .get('/api/stations/pending')
      .set('Authorization', userToken);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/stations/:id', () => {
  it('200 — returns the station document', async () => {
    const res = await request(app).get(`/api/stations/${activeStationId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(activeStationId);
    expect(res.body.data.name).toBe('Colombo Solar Hub');
  });

  it('404 — unknown ObjectId returns not-found', async () => {
    const unknownId = new Types.ObjectId().toString();
    const res = await request(app).get(`/api/stations/${unknownId}`);

    expect(res.status).toBe(404);
  });

  it('404 — invalid id format (ObjectId.isValid = false) returns not-found', async () => {
    const res = await request(app).get('/api/stations/this-is-not-an-objectid');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/stations', () => {
  const validBody = {
    name:         'New Solar Station',
    lat:          7.2906,
    lng:          80.6337,
    connectors:   [{ type: 'Type-2', powerKw: 7.4, count: 2 }],
    solarPanelKw: 10,
  };

  it('201 — creates station with status:pending and correct submittedBy', async () => {
    const res = await request(app)
      .post('/api/stations')
      .set('Authorization', userToken)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.submittedBy.toString()).toBe(USER_ID.toString());
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app)
      .post('/api/stations')
      .send(validBody);

    expect(res.status).toBe(401);
  });

  it('422 — missing connectors[] fails Joi validation', async () => {
    const { connectors: _, ...bodyWithout } = validBody;
    const res = await request(app)
      .post('/api/stations')
      .set('Authorization', userToken)
      .send(bodyWithout);

    expect(res.status).toBe(422);
  });

  it('422 — missing solarPanelKw fails Joi validation', async () => {
    const { solarPanelKw: _, ...bodyWithout } = validBody;
    const res = await request(app)
      .post('/api/stations')
      .set('Authorization', userToken)
      .send(bodyWithout);

    expect(res.status).toBe(422);
  });

  it('422 — invalid connector type fails Joi validation', async () => {
    const res = await request(app)
      .post('/api/stations')
      .set('Authorization', userToken)
      .send({ ...validBody, connectors: [{ type: 'InvalidType', powerKw: 7, count: 1 }] });

    expect(res.status).toBe(422);
  });
});

describe('PUT /api/stations/:id', () => {
  it('200 — owner can update station name', async () => {
    const res = await request(app)
      .put(`/api/stations/${activeStationId}`)
      .set('Authorization', userToken)
      .send({ name: 'Colombo Solar Hub Updated' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Colombo Solar Hub Updated');
  });

  it("403 — non-owner cannot update another user's station", async () => {
    const res = await request(app)
      .put(`/api/stations/${otherStationId}`)
      .set('Authorization', userToken)
      .send({ name: 'Hacked Name' });

    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app)
      .put(`/api/stations/${activeStationId}`)
      .send({ name: 'X' });

    expect(res.status).toBe(401);
  });

  it('422 — name shorter than 3 characters fails validation', async () => {
    const res = await request(app)
      .put(`/api/stations/${activeStationId}`)
      .set('Authorization', userToken)
      .send({ name: 'AB' });

    expect(res.status).toBe(422);
  });

  it('404 — unknown station returns not-found', async () => {
    const unknownId = new Types.ObjectId().toString();
    const res = await request(app)
      .put(`/api/stations/${unknownId}`)
      .set('Authorization', userToken)
      .send({ name: 'Ghost Station' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/stations/:id', () => {
  it('204 — owner can soft-delete station (subsequent GET returns 404)', async () => {
    const deleteRes = await request(app)
      .delete(`/api/stations/${deleteStationId}`)
      .set('Authorization', userToken);

    expect(deleteRes.status).toBe(204);
    const getRes = await request(app).get(`/api/stations/${deleteStationId}`);
    expect(getRes.status).toBe(404);
  });

  it('401 — unauthenticated delete is rejected', async () => {
    const res = await request(app).delete(`/api/stations/${activeStationId}`);

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/stations/:id/approve', () => {
  it('200 — moderator can approve a pending station (status becomes active)', async () => {
    const res = await request(app)
      .patch(`/api/stations/${pendingStationId}/approve`)
      .set('Authorization', modToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.isVerified).toBe(true);
  });

  it('400 — approving an already-active station is rejected', async () => {
    const res = await request(app)
      .patch(`/api/stations/${pendingStationId}/approve`)
      .set('Authorization', modToken);

    expect(res.status).toBe(400);
  });

  it('403 — plain user role cannot approve', async () => {
    const res = await request(app)
      .patch(`/api/stations/${activeStationId}/approve`)
      .set('Authorization', userToken);

    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app)
      .patch(`/api/stations/${activeStationId}/approve`);

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/stations/:id/reject', () => {
  let rejectTargetId: string;

  beforeAll(async () => {
    const s = await Station.create({
      name:         'Station For Rejection',
      submittedBy:  USER_ID,
      connectors:   [{ type: 'USB-C', powerKw: 3.7, count: 2 }],
      solarPanelKw: 5,
      status:       'pending',
      isActive:     true,
    });
    rejectTargetId = s._id.toString();
  });

  it('200 — moderator can reject a pending station with a reason', async () => {
    const res = await request(app)
      .patch(`/api/stations/${rejectTargetId}/reject`)
      .set('Authorization', modToken)
      .send({ rejectionReason: 'Location data is missing and cannot be verified.' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
    expect(res.body.data.rejectionReason).toBe('Location data is missing and cannot be verified.');
  });

  it('422 — missing rejectionReason fails Joi validation', async () => {
    const anotherPending = await Station.create({
      name: 'Another Pending', submittedBy: USER_ID,
      connectors: [{ type: 'CCS', powerKw: 50, count: 1 }],
      solarPanelKw: 10, status: 'pending', isActive: true,
    });

    const res = await request(app)
      .patch(`/api/stations/${anotherPending._id}/reject`)
      .set('Authorization', modToken)
      .send({});

    expect(res.status).toBe(422);
  });

  it('403 — plain user cannot reject', async () => {
    const res = await request(app)
      .patch(`/api/stations/${activeStationId}/reject`)
      .set('Authorization', userToken)
      .send({ rejectionReason: 'This rejection should be forbidden.' });

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/stations/:id/feature', () => {
  it('200 — moderator can toggle isFeatured on an active station', async () => {
    const res = await request(app)
      .patch(`/api/stations/${featureStationId}/feature`)
      .set('Authorization', modToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isFeatured).toBe(true);
  });

  it('200 — second toggle reverts isFeatured back to false', async () => {
    const res = await request(app)
      .patch(`/api/stations/${featureStationId}/feature`)
      .set('Authorization', modToken);

    expect(res.status).toBe(200);
    expect(res.body.data.isFeatured).toBe(false);
  });

  it('403 — plain user cannot feature a station', async () => {
    const res = await request(app)
      .patch(`/api/stations/${featureStationId}/feature`)
      .set('Authorization', userToken);

    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app)
      .patch(`/api/stations/${featureStationId}/feature`);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/stations/:id/stats', () => {
  it('200 — returns the stats object with expected fields', async () => {
    const res = await request(app)
      .get(`/api/stations/${activeStationId}/stats`)
      .set('Authorization', userToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      stationId:     activeStationId,
      averageRating: expect.any(Number),
      reviewCount:   expect.any(Number),
      isFeatured:    expect.any(Boolean),
      isVerified:    expect.any(Boolean),
    });
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app)
      .get(`/api/stations/${activeStationId}/stats`);

    expect(res.status).toBe(401);
  });

  it('404 — unknown station returns not-found', async () => {
    const unknownId = new Types.ObjectId().toString();
    const res = await request(app)
      .get(`/api/stations/${unknownId}/stats`)
      .set('Authorization', userToken);

    expect(res.status).toBe(404);
  });
});

