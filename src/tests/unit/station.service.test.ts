/**
 * Unit tests — StationService
 * Member 1 — Station Management
 *
 * Strategy: all Mongoose models and external API clients are mocked via
 * jest.mock() so the service layer runs in complete isolation.
 *
 * Run: npm test
 * Coverage: npm run test:coverage
 */

import mongoose, { Types } from 'mongoose';
import * as stationService from '@modules/stations/station.service';
import { Station } from '@modules/stations/station.model';
import * as geocoder from '@utils/geocoder';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Side-effect import in station.service.ts — provide an empty stub
jest.mock('@modules/users/user.model', () => ({}));

// Mock the Station Mongoose model — we provide the full static interface
jest.mock('@modules/stations/station.model', () => ({
  Station: {
    find:           jest.fn(),
    findOne:        jest.fn(),
    create:         jest.fn(),
    countDocuments: jest.fn(),
    aggregate:      jest.fn(),
  },
  // Re-export constants so imports in the service file still resolve
  CONNECTOR_TYPES: ['USB-C', 'Type-2', 'CCS', 'CHAdeMO', 'Tesla-NACS', 'AC-Socket'],
  AMENITY_VALUES:  ['wifi', 'cafe', 'restroom', 'parking', 'security', 'shade', 'water', 'repair_shop', 'ev_parking'],
  DAYS_OF_WEEK:    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
}));

// Mock geocoder — service calls forwardGeocode / reverseGeocode
jest.mock('@utils/geocoder');

// Silence logger output during tests
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

// ── Constants ─────────────────────────────────────────────────────────────────

const OWNER_ID   = new Types.ObjectId().toString();
const OTHER_ID   = new Types.ObjectId().toString();
const MOD_ID     = new Types.ObjectId().toString();
const STATION_ID = new Types.ObjectId().toString();

const mockGeoResult = {
  lat: 6.9271,
  lng: 79.8612,
  street:           'Galle Rd',
  city:             'Colombo',
  district:         'Western Province',
  country:          'Sri Lanka',
  postalCode:       '00300',
  formattedAddress: 'Galle Rd, Colombo, Sri Lanka',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a realistic-looking mock Mongoose station document. */
function makeMockStation(overrides: Record<string, unknown> = {}) {
  return {
    _id:             new Types.ObjectId(STATION_ID),
    name:            'Test Station',
    description:     'A test solar charging station',
    status:          'pending' as const,
    isActive:        true,
    submittedBy:     new Types.ObjectId(OWNER_ID),
    geocodePending:  false,
    location:        { type: 'Point', coordinates: [79.8612, 6.9271] },
    address:         { street: 'Galle Rd', city: 'Colombo', district: null, country: 'Sri Lanka', postalCode: null, formattedAddress: null },
    connectors:      [{ type: 'Type-2', powerKw: 7, count: 2 }],
    solarPanelKw:    5,
    amenities:       [] as string[],
    images:          [] as string[],
    operatingHours:  { alwaysOpen: false, schedule: [] },
    averageRating:   0,
    reviewCount:     0,
    isVerified:      false,
    verifiedBy:      null  as Types.ObjectId | null,
    verifiedAt:      null  as Date | null,
    rejectionReason: null  as string | null,
    isFeatured:      false,
    deletedAt:       null  as Date | null,
    deletedBy:       null  as Types.ObjectId | null,
    save:            jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Returns a mock Mongoose query chain that resolves to the given value when
 * .lean() is finally called. Used for Station.find() and similar chained calls.
 */
function makeChain(resolvedValue: unknown) {
  const chain: Record<string, jest.Mock> = {
    sort:     jest.fn(),
    skip:     jest.fn(),
    limit:    jest.fn(),
    select:   jest.fn(),
    populate: jest.fn(),
    lean:     jest.fn().mockResolvedValue(resolvedValue),
  };
  // Each method except lean() returns the chain for fluent access
  for (const key of ['sort', 'skip', 'limit', 'select', 'populate']) {
    chain[key].mockReturnValue(chain);
  }
  return chain;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// =============================================================================
// createStation
// =============================================================================

describe('createStation', () => {
  const baseInput = {
    name:         'Solar Hub',
    connectors:   [{ type: 'Type-2' as const, powerKw: 7, count: 2 }],
    solarPanelKw: 5,
    submittedBy:  OWNER_ID,
  };

  it('geocodes addressString, saves with correct coordinates and geocodePending:false', async () => {
    (geocoder.forwardGeocode as jest.Mock).mockResolvedValue(mockGeoResult);
    const created = makeMockStation({ geocodePending: false });
    (Station.create as jest.Mock).mockResolvedValue(created);

    const result = await stationService.createStation({ ...baseInput, addressString: 'Galle Rd, Colombo' });

    expect(geocoder.forwardGeocode).toHaveBeenCalledWith('Galle Rd, Colombo');

    const createArg = (Station.create as jest.Mock).mock.calls[0][0];
    // GeoJSON stores [longitude, latitude]
    expect(createArg.location.coordinates).toEqual([mockGeoResult.lng, mockGeoResult.lat]);
    expect(createArg.geocodePending).toBe(false);
    expect(createArg.address.city).toBe('Colombo');
    expect(result).toBeDefined();
  });

  it('sets geocodePending:true and omits location when forwardGeocode returns null', async () => {
    (geocoder.forwardGeocode as jest.Mock).mockResolvedValue(null);
    const created = makeMockStation({ geocodePending: true });
    (Station.create as jest.Mock).mockResolvedValue(created);

    await stationService.createStation({ ...baseInput, addressString: 'Unknown Address XYZ' });

    const createArg = (Station.create as jest.Mock).mock.calls[0][0];
    expect(createArg.geocodePending).toBe(true);
    expect(createArg.location).toBeUndefined();
  });

  it('sets geocodePending:true when forwardGeocode throws (network error)', async () => {
    (geocoder.forwardGeocode as jest.Mock).mockRejectedValue(new Error('Network error'));
    const created = makeMockStation({ geocodePending: true });
    (Station.create as jest.Mock).mockResolvedValue(created);

    await stationService.createStation({ ...baseInput, addressString: 'Colombo' });

    const createArg = (Station.create as jest.Mock).mock.calls[0][0];
    expect(createArg.geocodePending).toBe(true);
  });

  it('uses lat/lng directly when no addressString and calls reverseGeocode', async () => {
    (geocoder.reverseGeocode as jest.Mock).mockResolvedValue(mockGeoResult);
    (Station.create as jest.Mock).mockResolvedValue(makeMockStation());

    await stationService.createStation({ ...baseInput, lat: 6.9271, lng: 79.8612 });

    expect(geocoder.forwardGeocode).not.toHaveBeenCalled();
    expect(geocoder.reverseGeocode).toHaveBeenCalledWith(6.9271, 79.8612);

    const createArg = (Station.create as jest.Mock).mock.calls[0][0];
    // GeoJSON format: [lng, lat]
    expect(createArg.location.coordinates).toEqual([79.8612, 6.9271]);
  });

  it('throws 400 when neither addressString nor lat/lng are provided', async () => {
    await expect(
      stationService.createStation({ ...baseInput })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(Station.create).not.toHaveBeenCalled();
  });

  it('persists the submittedBy field as a Mongoose ObjectId', async () => {
    (geocoder.forwardGeocode as jest.Mock).mockResolvedValue(mockGeoResult);
    (Station.create as jest.Mock).mockResolvedValue(makeMockStation());

    await stationService.createStation({ ...baseInput, addressString: 'Colombo' });

    const createArg = (Station.create as jest.Mock).mock.calls[0][0];
    expect(createArg.submittedBy).toBeInstanceOf(Types.ObjectId);
    expect(createArg.submittedBy.toString()).toBe(OWNER_ID);
  });
});

// =============================================================================
// getStationById
// =============================================================================

describe('getStationById', () => {
  it('returns the station document for a valid ObjectId', async () => {
    const stationDoc = makeMockStation();
    const chain = makeChain(stationDoc);
    (Station.findOne as jest.Mock).mockReturnValue(chain);

    const result = await stationService.getStationById(STATION_ID);

    expect(Station.findOne).toHaveBeenCalledWith({ _id: STATION_ID, isActive: true });
    expect(result).toEqual(stationDoc);
  });

  it('throws 404 for an invalid ObjectId format', async () => {
    await expect(
      stationService.getStationById('not-a-valid-id')
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(Station.findOne).not.toHaveBeenCalled();
  });

  it('throws 404 when the station does not exist (findOne returns null)', async () => {
    const chain = makeChain(null);
    (Station.findOne as jest.Mock).mockReturnValue(chain);

    await expect(
      stationService.getStationById(STATION_ID)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// =============================================================================
// updateStation
// =============================================================================

describe('updateStation', () => {
  it('allows the owner to update — mutates fields and calls save()', async () => {
    const stationDoc = makeMockStation({ submittedBy: new Types.ObjectId(OWNER_ID) });
    (Station.findOne as jest.Mock).mockResolvedValue(stationDoc);

    await stationService.updateStation(STATION_ID, { name: 'Updated Name' }, OWNER_ID);

    expect(stationDoc.name).toBe('Updated Name');
    expect(stationDoc.save).toHaveBeenCalledTimes(1);
  });

  it('throws 403 when the requester is not the owner', async () => {
    const stationDoc = makeMockStation({ submittedBy: new Types.ObjectId(OWNER_ID) });
    (Station.findOne as jest.Mock).mockResolvedValue(stationDoc);

    await expect(
      stationService.updateStation(STATION_ID, { name: 'Hacked' }, OTHER_ID)
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(stationDoc.save).not.toHaveBeenCalled();
  });

  it('re-geocodes location when a new addressString is provided', async () => {
    const stationDoc = makeMockStation({ submittedBy: new Types.ObjectId(OWNER_ID) });
    (Station.findOne as jest.Mock).mockResolvedValue(stationDoc);
    (geocoder.forwardGeocode as jest.Mock).mockResolvedValue(mockGeoResult);

    await stationService.updateStation(STATION_ID, { addressString: 'New Address, Kandy' }, OWNER_ID);

    expect(geocoder.forwardGeocode).toHaveBeenCalledWith('New Address, Kandy');
    expect(stationDoc.location.coordinates).toEqual([mockGeoResult.lng, mockGeoResult.lat]);
    expect(stationDoc.geocodePending).toBe(false);
    expect(stationDoc.save).toHaveBeenCalled();
  });

  it('sets geocodePending:true if re-geocoding fails on update', async () => {
    const stationDoc = makeMockStation({ submittedBy: new Types.ObjectId(OWNER_ID) });
    (Station.findOne as jest.Mock).mockResolvedValue(stationDoc);
    (geocoder.forwardGeocode as jest.Mock).mockRejectedValue(new Error('Timeout'));

    await stationService.updateStation(STATION_ID, { addressString: 'Any Address' }, OWNER_ID);

    expect(stationDoc.geocodePending).toBe(true);
    expect(stationDoc.save).toHaveBeenCalled();
  });

  it('updates location directly when lat/lng are provided without addressString', async () => {
    const stationDoc = makeMockStation({ submittedBy: new Types.ObjectId(OWNER_ID) });
    (Station.findOne as jest.Mock).mockResolvedValue(stationDoc);
    (geocoder.reverseGeocode as jest.Mock).mockResolvedValue(mockGeoResult);

    await stationService.updateStation(STATION_ID, { lat: 7.2906, lng: 80.6337 }, OWNER_ID);

    expect(stationDoc.location.coordinates).toEqual([80.6337, 7.2906]);
    expect(stationDoc.geocodePending).toBe(false);
  });

  it('throws 404 for an invalid ObjectId', async () => {
    await expect(
      stationService.updateStation('bad-id', { name: 'X' }, OWNER_ID)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 when station is not found', async () => {
    (Station.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      stationService.updateStation(STATION_ID, { name: 'X' }, OWNER_ID)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// =============================================================================
// getNearbyStations
// =============================================================================

describe('getNearbyStations', () => {
  it('calls Station.aggregate with $geoNear using [lng, lat] coordinate order', async () => {
    (Station.aggregate as jest.Mock).mockResolvedValue([]);

    await stationService.getNearbyStations({ lat: 6.9271, lng: 79.8612, radius: 5, limit: 10 });

    const [pipeline] = (Station.aggregate as jest.Mock).mock.calls[0];
    const geoNear = pipeline[0].$geoNear;
    expect(geoNear.near.coordinates).toEqual([79.8612, 6.9271]); // GeoJSON order
    expect(geoNear.maxDistance).toBe(5 * 1000);                  // km → metres
    expect(geoNear.spherical).toBe(true);
    expect(geoNear.distanceField).toBe('distanceMetres');
  });

  it('defaults radius to 10 km when not provided', async () => {
    (Station.aggregate as jest.Mock).mockResolvedValue([]);

    await stationService.getNearbyStations({ lat: 6.9271, lng: 79.8612 });

    const [pipeline] = (Station.aggregate as jest.Mock).mock.calls[0];
    expect(pipeline[0].$geoNear.maxDistance).toBe(10 * 1000);
  });

  it('respects the limit parameter via $limit stage', async () => {
    (Station.aggregate as jest.Mock).mockResolvedValue([]);

    await stationService.getNearbyStations({ lat: 6.9, lng: 79.8, limit: 5 });

    const [pipeline] = (Station.aggregate as jest.Mock).mock.calls[0];
    const limitStage = pipeline.find((s: object) => '$limit' in s);
    expect(limitStage?.$limit).toBe(5);
  });

  it('returns the aggregation result array', async () => {
    const mockResults = [makeMockStation(), makeMockStation()];
    (Station.aggregate as jest.Mock).mockResolvedValue(mockResults);

    const result = await stationService.getNearbyStations({ lat: 6.9, lng: 79.8 });

    expect(result).toEqual(mockResults);
  });

  it('filters pipeline to only active stations', async () => {
    (Station.aggregate as jest.Mock).mockResolvedValue([]);

    await stationService.getNearbyStations({ lat: 6.9, lng: 79.8 });

    const [pipeline] = (Station.aggregate as jest.Mock).mock.calls[0];
    const query = pipeline[0].$geoNear.query;
    expect(query.isActive).toBe(true);
    expect(query.status).toBe('active');
  });
});

// =============================================================================
// listStations
// =============================================================================

describe('listStations', () => {
  it('returns paginated result with default page and limit', async () => {
    const mockDocs = [makeMockStation()];
    (Station.find as jest.Mock).mockReturnValue(makeChain(mockDocs));
    (Station.countDocuments as jest.Mock).mockResolvedValue(1);

    const result = await stationService.listStations({});

    expect(result.stations).toEqual(mockDocs);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.limit).toBe(10);
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.totalPages).toBe(1);
    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.hasPrev).toBe(false);
  });

  it('builds $geoWithin filter when lat and lng are provided', async () => {
    (Station.find as jest.Mock).mockReturnValue(makeChain([]));
    (Station.countDocuments as jest.Mock).mockResolvedValue(0);

    await stationService.listStations({ lat: 6.9, lng: 79.8, radius: 20 });

    const [filterArg] = (Station.find as jest.Mock).mock.calls[0];
    expect(filterArg.location).toBeDefined();
    // $centerSphere uses [lng, lat]
    expect(filterArg.location.$geoWithin.$centerSphere[0]).toEqual([79.8, 6.9]);
  });

  it('builds $text filter when a search string is given', async () => {
    (Station.find as jest.Mock).mockReturnValue(makeChain([]));
    (Station.countDocuments as jest.Mock).mockResolvedValue(0);

    await stationService.listStations({ search: 'colombo solar' });

    const [filterArg] = (Station.find as jest.Mock).mock.calls[0];
    expect(filterArg.$text).toEqual({ $search: 'colombo solar' });
  });

  it('filters by connectorType when provided', async () => {
    (Station.find as jest.Mock).mockReturnValue(makeChain([]));
    (Station.countDocuments as jest.Mock).mockResolvedValue(0);

    await stationService.listStations({ connectorType: 'CCS' });

    const [filterArg] = (Station.find as jest.Mock).mock.calls[0];
    expect(filterArg['connectors.type']).toBe('CCS');
  });

  it('filters by minRating when provided', async () => {
    (Station.find as jest.Mock).mockReturnValue(makeChain([]));
    (Station.countDocuments as jest.Mock).mockResolvedValue(0);

    await stationService.listStations({ minRating: 4 });

    const [filterArg] = (Station.find as jest.Mock).mock.calls[0];
    expect(filterArg.averageRating).toEqual({ $gte: 4 });
  });

  it('filters by isVerified when provided', async () => {
    (Station.find as jest.Mock).mockReturnValue(makeChain([]));
    (Station.countDocuments as jest.Mock).mockResolvedValue(0);

    await stationService.listStations({ isVerified: true });

    const [filterArg] = (Station.find as jest.Mock).mock.calls[0];
    expect(filterArg.isVerified).toBe(true);
  });

  it('correctly calculates hasNext and hasPrev for middle pages', async () => {
    (Station.find as jest.Mock).mockReturnValue(makeChain([]));
    (Station.countDocuments as jest.Mock).mockResolvedValue(30);

    const result = await stationService.listStations({ page: 2, limit: 10 });

    expect(result.pagination.hasNext).toBe(true);
    expect(result.pagination.hasPrev).toBe(true);
    expect(result.pagination.totalPages).toBe(3);
  });
});

// =============================================================================
// approveStation
// =============================================================================

describe('approveStation', () => {
  it('sets status to active, isVerified:true, records verifiedBy and verifiedAt', async () => {
    const stationDoc = makeMockStation({ status: 'pending' });
    (Station.findOne as jest.Mock).mockResolvedValue(stationDoc);

    await stationService.approveStation(STATION_ID, MOD_ID);

    expect(stationDoc.status).toBe('active');
    expect(stationDoc.isVerified).toBe(true);
    expect((stationDoc.verifiedBy as unknown as Types.ObjectId).toString()).toBe(MOD_ID);
    expect(stationDoc.verifiedAt).toBeInstanceOf(Date);
    expect(stationDoc.rejectionReason).toBeNull();
    expect(stationDoc.save).toHaveBeenCalledTimes(1);
  });

  it('throws 400 when station status is not pending', async () => {
    const stationDoc = makeMockStation({ status: 'active' });
    (Station.findOne as jest.Mock).mockResolvedValue(stationDoc);

    await expect(
      stationService.approveStation(STATION_ID, MOD_ID)
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(stationDoc.save).not.toHaveBeenCalled();
  });

  it('throws 400 for a rejected station', async () => {
    const stationDoc = makeMockStation({ status: 'rejected' });
    (Station.findOne as jest.Mock).mockResolvedValue(stationDoc);

    await expect(
      stationService.approveStation(STATION_ID, MOD_ID)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 404 for invalid ObjectId', async () => {
    await expect(
      stationService.approveStation('bad-id', MOD_ID)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 when station is not found', async () => {
    (Station.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      stationService.approveStation(STATION_ID, MOD_ID)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// =============================================================================
// rejectStation
// =============================================================================

describe('rejectStation', () => {
  it('sets status to rejected and persists the rejectionReason', async () => {
    const stationDoc = makeMockStation({ status: 'pending' });
    (Station.findOne as jest.Mock).mockResolvedValue(stationDoc);

    await stationService.rejectStation(STATION_ID, 'Insufficient solar panel information', MOD_ID);

    expect(stationDoc.status).toBe('rejected');
    expect(stationDoc.rejectionReason).toBe('Insufficient solar panel information');
    expect(stationDoc.save).toHaveBeenCalledTimes(1);
  });

  it('throws 400 when station is not in pending status', async () => {
    const stationDoc = makeMockStation({ status: 'active' });
    (Station.findOne as jest.Mock).mockResolvedValue(stationDoc);

    await expect(
      stationService.rejectStation(STATION_ID, 'Some reason', MOD_ID)
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(stationDoc.save).not.toHaveBeenCalled();
  });

  it('throws 404 for invalid ObjectId', async () => {
    await expect(
      stationService.rejectStation('bad-id', 'reason', MOD_ID)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// =============================================================================
// deleteStation
// =============================================================================

describe('deleteStation', () => {
  it('soft-deletes by setting isActive:false, deletedAt, and deletedBy', async () => {
    const stationDoc = makeMockStation({ isActive: true });
    (Station.findOne as jest.Mock).mockResolvedValue(stationDoc);

    await stationService.deleteStation(STATION_ID, OWNER_ID);

    expect(stationDoc.isActive).toBe(false);
    expect(stationDoc.deletedAt).toBeInstanceOf(Date);
    expect((stationDoc.deletedBy as unknown as Types.ObjectId).toString()).toBe(OWNER_ID);
    expect(stationDoc.save).toHaveBeenCalledTimes(1);
  });

  it('throws 404 when station is not found', async () => {
    (Station.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      stationService.deleteStation(STATION_ID, OWNER_ID)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 for invalid ObjectId', async () => {
    await expect(
      stationService.deleteStation('bad-id', OWNER_ID)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// =============================================================================
// featureStation
// =============================================================================

describe('featureStation', () => {
  it('toggles isFeatured from false to true on an active station', async () => {
    const stationDoc = makeMockStation({ status: 'active', isFeatured: false });
    (Station.findOne as jest.Mock).mockResolvedValue(stationDoc);

    const result = await stationService.featureStation(STATION_ID, MOD_ID);

    expect(result.isFeatured).toBe(true);
    expect(stationDoc.save).toHaveBeenCalledTimes(1);
  });

  it('toggles isFeatured from true to false', async () => {
    const stationDoc = makeMockStation({ status: 'active', isFeatured: true });
    (Station.findOne as jest.Mock).mockResolvedValue(stationDoc);

    const result = await stationService.featureStation(STATION_ID, MOD_ID);

    expect(result.isFeatured).toBe(false);
    expect(stationDoc.save).toHaveBeenCalledTimes(1);
  });

  it('throws 400 when the station is not active', async () => {
    const stationDoc = makeMockStation({ status: 'pending', isFeatured: false });
    (Station.findOne as jest.Mock).mockResolvedValue(stationDoc);

    await expect(
      stationService.featureStation(STATION_ID, MOD_ID)
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(stationDoc.save).not.toHaveBeenCalled();
  });

  it('throws 404 for invalid ObjectId', async () => {
    await expect(
      stationService.featureStation('bad-id', MOD_ID)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// =============================================================================
// getStationStats
// =============================================================================

describe('getStationStats', () => {
  it('returns a stats object with the expected shape', async () => {
    const stationDoc = {
      _id:            new Types.ObjectId(STATION_ID),
      name:           'Test Station',
      status:         'active',
      averageRating:  4.2,
      reviewCount:    15,
      isFeatured:     true,
      isVerified:     true,
      geocodePending: false,
      verifiedAt:     new Date('2025-01-01'),
      createdAt:      new Date('2024-06-01'),
      updatedAt:      new Date('2025-01-01'),
    };
    const chain = makeChain(stationDoc);
    (Station.findOne as jest.Mock).mockReturnValue(chain);

    const stats = await stationService.getStationStats(STATION_ID);

    expect(stats.stationId).toBe(STATION_ID);
    expect(stats.averageRating).toBe(4.2);
    expect(stats.reviewCount).toBe(15);
    expect(stats.isFeatured).toBe(true);
    expect(stats.isVerified).toBe(true);
  });

  it('throws 404 for invalid ObjectId', async () => {
    await expect(
      stationService.getStationStats('not-an-id')
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 when station is not found', async () => {
    const chain = makeChain(null);
    (Station.findOne as jest.Mock).mockReturnValue(chain);

    await expect(
      stationService.getStationStats(STATION_ID)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

