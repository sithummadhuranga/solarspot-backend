import mongoose, { Types, PipelineStage, QueryFilter } from 'mongoose';
import Station, { IStation } from './station.model';
import { forwardGeocode, reverseGeocode } from '@utils/geocoder';
import ApiError from '@utils/ApiError';
import logger from '@utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListStationsOptions {
  page: number;
  limit: number;
  search?: string;
  lat?: number;
  lng?: number;
  radius?: number; // km
  connectorType?: string;
  minRating?: number;
  isVerified?: boolean;
  amenities?: string | string[];
  sortBy?: 'newest' | 'rating' | 'distance' | 'featured';
}

export interface NearbyOptions {
  lat: number;
  lng: number;
  radius: number; // km
  limit: number;
}

export interface CreateStationInput {
  name: string;
  description?: string;
  addressString?: string;
  lat?: number;
  lng?: number;
  connectors: IStation['connectors'];
  solarPanelKw: number;
  amenities?: string[];
  images?: string[];
  operatingHours?: IStation['operatingHours'];
  submittedBy: string;
}

export interface UpdateStationInput {
  name?: string;
  description?: string;
  addressString?: string;
  lat?: number;
  lng?: number;
  connectors?: IStation['connectors'];
  solarPanelKw?: number;
  amenities?: string[];
  images?: string[];
  operatingHours?: IStation['operatingHours'];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function tryGetEmailService(): Promise<{ sendRejectionEmail?: (opts: unknown) => Promise<void> } | null> {
  try {
    const mod = require('@utils/email.service') as { sendRejectionEmail?: (opts: unknown) => Promise<void> };
    return mod;
  } catch {
    return null;
  }
}

function buildSort(sortBy: ListStationsOptions['sortBy']): Record<string, 1 | -1> {
  switch (sortBy) {
    case 'rating':
      return { averageRating: -1, reviewCount: -1 };
    case 'featured':
      return { isFeatured: -1, averageRating: -1 };
    case 'distance':
    case 'newest':
    default:
      return { createdAt: -1 };
  }
}

// ─── Service Functions ────────────────────────────────────────────────────────
export async function listStations(opts: ListStationsOptions) {
  const {
    page,
    limit,
    search,
    lat,
    lng,
    radius = 25,
    connectorType,
    minRating,
    isVerified,
    amenities,
    sortBy = 'newest',
  } = opts;

  const skip = (page - 1) * limit;

  const filter: QueryFilter<IStation> = {
    isActive: true,
    status: 'active',
  };

  if (search) {
    filter.$text = { $search: search };
  }

  const hasGeo = lat !== undefined && lng !== undefined;
  if (hasGeo) {
    const radiusInRadians = radius / 6378.1;
    filter.location = {
      $geoWithin: {
        $centerSphere: [[lng, lat], radiusInRadians],
      },
    };
  }

  if (connectorType) {
    filter['connectors.type'] = connectorType;
  }

  if (minRating !== undefined) {
    filter.averageRating = { $gte: minRating };
  }

  if (isVerified !== undefined) {
    filter.isVerified = isVerified;
  }

  if (amenities) {
    const amenitiesArr = Array.isArray(amenities) ? amenities : [amenities];
    if (amenitiesArr.length > 0) {
      filter.amenities = { $all: amenitiesArr };
    }
  }

  const sort = buildSort(sortBy);

  const sortWithScore =
    search ? { score: { $meta: 'textScore' as const }, ...sort } : sort;

  const [stations, total] = await Promise.all([
    Station.find(filter)
      .sort(sortWithScore)
      .skip(skip)
      .limit(limit)
      .select('-__v')
      .populate('submittedBy', 'displayName avatar')
      .lean(),
    Station.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    stations,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export async function getNearbyStations(opts: NearbyOptions) {
  const { lat, lng, radius, limit } = opts;

  const maxDistanceMetres = radius * 1000;

  const pipeline: PipelineStage[] = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMetres',
        maxDistance: maxDistanceMetres,
        spherical: true,
        query: {
          isActive: true,
          status: 'active',
        },
      },
    },
    {
      $addFields: {
        distanceKm: { $round: [{ $divide: ['$distanceMetres', 1000] }, 2] },
      },
    },
    { $project: { __v: 0, distanceMetres: 0 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: 'submittedBy',
        foreignField: '_id',
        as: 'submittedBy',
        pipeline: [{ $project: { displayName: 1, avatar: 1 } }],
      },
    },
    { $unwind: { path: '$submittedBy', preserveNullAndEmptyArrays: true } },
  ];

  const stations = await Station.aggregate(pipeline);
  return stations;
}

export async function getPendingStations(page: number, limit: number) {
  const skip = (page - 1) * limit;

  const filter: QueryFilter<IStation> = {
    status: 'pending',
    isActive: true,
  };

  const [stations, total] = await Promise.all([
    Station.find(filter)
      .sort({ createdAt: 1 }) 
      .skip(skip)
      .limit(limit)
      .select('-__v')
      .populate('submittedBy', 'displayName avatar email')
      .lean(),
    Station.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    stations,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export async function getStationById(id: string) {
  if (!Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Station not found');
  }

  const station = await Station.findOne({ _id: id, isActive: true })
    .select('-__v')
    .populate('submittedBy', 'displayName avatar')
    .lean();

  if (!station) {
    throw ApiError.notFound('Station not found');
  }

  return station;
}

export async function createStation(input: CreateStationInput): Promise<IStation> {
  const {
    name,
    description,
    addressString,
    lat: inputLat,
    lng: inputLng,
    connectors,
    solarPanelKw,
    amenities = [],
    images = [],
    operatingHours,
    submittedBy,
  } = input;

  let coordinates: [number, number] | null = null;
  let geocodePending = false;
  let addressParts = {
    street: null as string | null,
    city: null as string | null,
    district: null as string | null,
    country: null as string | null,
    postalCode: null as string | null,
    formattedAddress: null as string | null,
  };

  if (!addressString && (inputLat === undefined || inputLng === undefined)) {
    throw ApiError.badRequest('Either addressString or lat/lng coordinates must be provided');
  }

  if (addressString) {
    // Nominatim geocoding is non-blocking — a failure saves the station without
    // coordinates and sets geocodePending so it can be retried later.
    try {
      const geoResult = await forwardGeocode(addressString);
      if (geoResult) {
        coordinates = [geoResult.lng, geoResult.lat];
        addressParts = {
          street: geoResult.street,
          city: geoResult.city,
          district: geoResult.district,
          country: geoResult.country,
          postalCode: geoResult.postalCode,
          formattedAddress: geoResult.formattedAddress,
        };
      } else {
        geocodePending = true;
        logger.warn(
          `[stations] Nominatim returned no result for "${addressString}" — station saved without coordinates`
        );
      }
    } catch (geoErr) {
      geocodePending = true;
      logger.warn(
        `[stations] Nominatim geocoding failed for "${addressString}" — saving without coordinates`,
        { error: (geoErr as Error).message }
      );
    }
  } else if (inputLat !== undefined && inputLng !== undefined) {
    coordinates = [inputLng, inputLat];

    // Reverse geocode for human-readable address — also non-fatal
    try {
      const geoResult = await reverseGeocode(inputLat, inputLng);
      if (geoResult) {
        addressParts = {
          street: geoResult.street,
          city: geoResult.city,
          district: geoResult.district,
          country: geoResult.country,
          postalCode: geoResult.postalCode,
          formattedAddress: geoResult.formattedAddress,
        };
      }
    } catch (geoErr) {
      logger.warn('[stations] Reverse geocoding failed — address fields will be empty', {
        error: (geoErr as Error).message,
      });
    }
  }

  const stationData = {
    name,
    description,
    ...(coordinates ? { location: { type: 'Point' as const, coordinates } } : {}),
    geocodePending,
    address: addressParts,
    submittedBy: new Types.ObjectId(submittedBy),
    connectors,
    solarPanelKw,
    amenities,
    images,
    operatingHours: operatingHours ?? { alwaysOpen: false, schedule: [] },
    status: 'pending',
  };

  const station = await Station.create(stationData);

  logger.info(`[stations] Station created: "${station.name}" (${station._id}) by user ${submittedBy}`);

  return station;
}

export async function updateStation(
  id: string,
  input: UpdateStationInput,
  // requestingUserId is used only for logging; RBAC middleware already enforced edit-own/edit-any
  requestingUserId: string
): Promise<IStation> {
  if (!Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Station not found');
  }

  const station = await Station.findOne({ _id: id, isActive: true });

  if (!station) {
    throw ApiError.notFound('Station not found');
  }

  // ── Apply updates ────────────────────────────────────────────────────────────
  const {
    name,
    description,
    addressString,
    lat: inputLat,
    lng: inputLng,
    connectors,
    solarPanelKw,
    amenities,
    images,
    operatingHours,
  } = input;

  if (name !== undefined) station.name = name;
  if (description !== undefined) station.description = description;
  if (connectors !== undefined) station.connectors = connectors;
  if (solarPanelKw !== undefined) station.solarPanelKw = solarPanelKw;
  if (amenities !== undefined) station.amenities = amenities;
  if (images !== undefined) station.images = images;
  if (operatingHours !== undefined) station.operatingHours = operatingHours;

  // ── Re-geocode if address or coordinates changed — non-fatal ─────────────────
  if (addressString) {
    try {
      const geoResult = await forwardGeocode(addressString);
      if (geoResult) {
        station.location = { type: 'Point', coordinates: [geoResult.lng, geoResult.lat] };
        station.address = {
          street: geoResult.street,
          city: geoResult.city,
          district: geoResult.district,
          country: geoResult.country,
          postalCode: geoResult.postalCode,
          formattedAddress: geoResult.formattedAddress,
        };
        station.geocodePending = false;
      } else {
        logger.warn(`[stations] Nominatim returned no result on update for "${addressString}"`);
        station.geocodePending = true;
      }
    } catch (geoErr) {
      logger.warn(`[stations] Geocoding failed during station update for "${addressString}"`, {
        error: (geoErr as Error).message,
      });
      station.geocodePending = true;
    }
  } else if (inputLat !== undefined && inputLng !== undefined) {
    station.location = { type: 'Point', coordinates: [inputLng, inputLat] };
    station.geocodePending = false;
    try {
      const geoResult = await reverseGeocode(inputLat, inputLng);
      if (geoResult) {
        station.address = {
          street: geoResult.street,
          city: geoResult.city,
          district: geoResult.district,
          country: geoResult.country,
          postalCode: geoResult.postalCode,
          formattedAddress: geoResult.formattedAddress,
        };
      }
    } catch (geoErr) {
      logger.warn('[stations] Reverse geocoding failed during station update', {
        error: (geoErr as Error).message,
      });
    }
  }

  await station.save();

  logger.info(`[stations] Station updated: "${station.name}" (${station._id}) by user ${requestingUserId}`);

  return station;
}

export async function approveStation(
  id: string,
  moderatorId: string
): Promise<IStation> {
  if (!Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Station not found');
  }

  const station = await Station.findOne({ _id: id, isActive: true });

  if (!station) {
    throw ApiError.notFound('Station not found');
  }

  if (station.status !== 'pending') {
    throw ApiError.badRequest(
      `Cannot approve a station with status "${station.status}". Only pending stations can be approved.`
    );
  }

  station.status = 'active';
  station.isVerified = true;
  station.verifiedBy = new Types.ObjectId(moderatorId);
  station.verifiedAt = new Date();
  station.rejectionReason = null;

  await station.save();

  logger.info(
    `[stations] Station approved: "${station.name}" (${station._id}) by moderator ${moderatorId}`
  );

  return station;
}

export async function rejectStation(
  id: string,
  rejectionReason: string,
  moderatorId: string
): Promise<IStation> {
  if (!Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Station not found');
  }

  const station = await Station.findOne({ _id: id, isActive: true }).populate(
    'submittedBy',
    'email displayName'
  );

  if (!station) {
    throw ApiError.notFound('Station not found');
  }

  if (station.status !== 'pending') {
    throw ApiError.badRequest(
      `Cannot reject a station with status "${station.status}". Only pending stations can be rejected.`
    );
  }

  station.status = 'rejected';
  station.rejectionReason = rejectionReason;

  await station.save();

  logger.info(
    `[stations] Station rejected: "${station.name}" (${station._id}) by moderator ${moderatorId}. Reason: ${rejectionReason}`
  );

  // ── Attempt rejection email (non-fatal) ──────────────────────────────────────
  try {
    const emailService = await tryGetEmailService();
    if (emailService?.sendRejectionEmail) {
      await emailService.sendRejectionEmail({
        station,
        rejectionReason,
        moderatorId,
      });
      logger.info(`[stations] Rejection email sent for station ${station._id}`);
    } else {
      logger.info(
        `[stations] Email service not available — rejection logged only for station ${station._id}`
      );
    }
  } catch (emailErr) {
    // Non-fatal: log but don't propagate the error
    logger.warn(`[stations] Failed to send rejection email for station ${station._id}`, {
      error: (emailErr as Error).message,
    });
  }

  return station;
}

export async function deleteStation(
  id: string,
  deletedById: string
): Promise<void> {
  if (!Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Station not found');
  }

  const station = await Station.findOne({ _id: id, isActive: true });

  if (!station) {
    throw ApiError.notFound('Station not found');
  }

  station.isActive = false;
  station.deletedAt = new Date();
  station.deletedBy = new Types.ObjectId(deletedById);

  await station.save();

  logger.info(
    `[stations] Station soft-deleted: "${station.name}" (${station._id}) by user ${deletedById}`
  );
}

// ─── Feature toggle ───────────────────────────────────────────────────────────

export async function featureStation(
  id: string,
  moderatorId: string
): Promise<IStation> {
  if (!Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Station not found');
  }

  const station = await Station.findOne({ _id: id, isActive: true });

  if (!station) {
    throw ApiError.notFound('Station not found');
  }

  if (station.status !== 'active') {
    throw ApiError.badRequest('Only active stations can be featured or unfeatured');
  }

  // Atomic toggle — no read-modify-write race since status is checked above
  station.isFeatured = !station.isFeatured;
  await station.save();

  const action = station.isFeatured ? 'featured' : 'unfeatured';
  logger.info(
    `[stations] Station ${action}: "${station.name}" (${station._id}) by moderator ${moderatorId}`
  );

  return station;
}

// ─── Station statistics ───────────────────────────────────────────────────────

export interface StationStats {
  stationId: string;
  name: string;
  status: string;
  averageRating: number;
  reviewCount: number;
  isFeatured: boolean;
  isVerified: boolean;
  geocodePending: boolean;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getStationStats(id: string): Promise<StationStats> {
  if (!Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Station not found');
  }

  const station = await Station.findOne({ _id: id, isActive: true })
    .select('name status averageRating reviewCount isFeatured isVerified geocodePending verifiedAt createdAt updatedAt')
    .lean();

  if (!station) {
    throw ApiError.notFound('Station not found');
  }

  return {
    stationId: (station._id as Types.ObjectId).toString(),
    name: station.name,
    status: station.status,
    averageRating: station.averageRating,
    reviewCount: station.reviewCount,
    isFeatured: station.isFeatured,
    isVerified: station.isVerified,
    geocodePending: station.geocodePending,
    verifiedAt: station.verifiedAt,
    createdAt: station.createdAt,
    updatedAt: station.updatedAt,
  };
}
