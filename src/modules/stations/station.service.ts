import { Types, PipelineStage } from 'mongoose';
import { Station } from './station.model';
import '@modules/users/user.model';
import type { IStation, ListStationsQuery, NearbyStationsQuery, CreateStationInput, UpdateStationInput } from '@/types';
import { forwardGeocode, reverseGeocode } from '@utils/geocoder';
import ApiError from '@utils/ApiError';
import logger from '@utils/logger';

function buildSort(sortBy: string): Record<string, 1 | -1> {
  switch (sortBy) {
    case 'rating':   return { averageRating: -1, reviewCount: -1 };
    case 'featured': return { isFeatured: -1, averageRating: -1 };
    default:         return { createdAt: -1 };
  }
}

export async function listStations(opts: ListStationsQuery) {
  const { page = 1, limit = 10, search, lat, lng, radius = 25, connectorType, minRating, isVerified, amenities, sortBy = 'newest' } = opts;
  const skip = (page - 1) * limit;

  const filter: Record<string, any> = { isActive: true, status: 'active' };

  if (search) filter.$text = { $search: search };

  if (lat !== undefined && lng !== undefined) {
    filter.location = { $geoWithin: { $centerSphere: [[lng, lat], radius / 6378.1] } };
  }

  if (connectorType) filter['connectors.type'] = connectorType;
  if (minRating !== undefined) filter.averageRating = { $gte: minRating };
  if (isVerified !== undefined) filter.isVerified = isVerified;
  if (amenities) {
    const arr = Array.isArray(amenities) ? amenities : [amenities];
    if (arr.length) filter.amenities = { $all: arr };
  }

  const sort = search 
    ? { score: { $meta: 'textScore' as const }, ...buildSort(sortBy) } 
    : buildSort(sortBy);

  const [stations, total] = await Promise.all([
    Station.find(filter).sort(sort).skip(skip).limit(limit)
      .select('-__v').populate('submittedBy', 'displayName avatarUrl').lean(),
    Station.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);
  return {
    stations,
    pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
}

export async function getNearbyStations(opts: NearbyStationsQuery) {
  const { lat, lng, radius = 10, limit = 20 } = opts;

  const pipeline: PipelineStage[] = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMetres',
        maxDistance: radius * 1000,
        spherical: true,
        query: { isActive: true, status: 'active' },
      },
    },
    { $addFields: { distanceKm: { $round: [{ $divide: ['$distanceMetres', 1000] }, 2] } } },
    { $project: { __v: 0, distanceMetres: 0 } },
    { $limit: limit },
    { $lookup: { from: 'users', localField: 'submittedBy', foreignField: '_id', as: 'submittedBy', pipeline: [{ $project: { displayName: 1, avatarUrl: 1 } }] } },
    { $unwind: { path: '$submittedBy', preserveNullAndEmptyArrays: true } },
  ];

  return Station.aggregate(pipeline);
}

export async function getPendingStations(page: number, limit: number) {
  const skip = (page - 1) * limit;
  const filter = { status: 'pending' as const, isActive: true };

  const [stations, total] = await Promise.all([
    Station.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit)
      .select('-__v').populate('submittedBy', 'displayName avatarUrl email').lean(),
    Station.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);
  return {
    stations,
    pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
}

export async function getStationById(id: string) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Station not found');

  const station = await Station.findOne({ _id: id, isActive: true })
    .select('-__v').populate('submittedBy', 'displayName avatarUrl').lean();

  if (!station) throw ApiError.notFound('Station not found');
  return station;
}

export async function createStation(input: CreateStationInput & { submittedBy: string }): Promise<IStation> {
  const { name, description, addressString, lat: inputLat, lng: inputLng, connectors, solarPanelKw, amenities = [], images = [], operatingHours, submittedBy } = input;

  if (!addressString && (inputLat === undefined || inputLng === undefined)) {
    throw ApiError.badRequest('Either addressString or lat/lng coordinates must be provided');
  }

  let coordinates: [number, number] | null = null;
  let geocodePending = false;
  let addressParts = { street: null as string | null, city: null as string | null, district: null as string | null, country: null as string | null, postalCode: null as string | null, formattedAddress: null as string | null };

  if (addressString) {
    try {
      const geo = await forwardGeocode(addressString);
      if (geo) {
        coordinates = [geo.lng, geo.lat];
        addressParts = { street: geo.street, city: geo.city, district: geo.district, country: geo.country, postalCode: geo.postalCode, formattedAddress: geo.formattedAddress };
      } else {
        geocodePending = true;
        logger.warn(`[stations] No geocode result for "${addressString}"`);
      }
    } catch {
      geocodePending = true;
      logger.warn(`[stations] Geocoding failed for "${addressString}"`);
    }
  } else if (inputLat !== undefined && inputLng !== undefined) {
    coordinates = [inputLng, inputLat];
    try {
      const geo = await reverseGeocode(inputLat, inputLng);
      if (geo) addressParts = { street: geo.street, city: geo.city, district: geo.district, country: geo.country, postalCode: geo.postalCode, formattedAddress: geo.formattedAddress };
    } catch {
      logger.warn(`[stations] Reverse geocoding failed for coordinates (${inputLat}, ${inputLng})`);
    }
  }

  const station = await Station.create({
    name, description,
    ...(coordinates ? { location: { type: 'Point' as const, coordinates } } : {}),
    geocodePending, address: addressParts,
    submittedBy: new Types.ObjectId(submittedBy),
    connectors, solarPanelKw, amenities, images,
    operatingHours: operatingHours ?? { alwaysOpen: false, schedule: [] },
  });

  logger.info(`[stations] Created: "${station.name}" (${station._id}) by ${submittedBy}`);
  return station;
}

export async function updateStation(id: string, input: UpdateStationInput, requesterId: string): Promise<IStation> {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Station not found');

  const station = await Station.findOne({ _id: id, isActive: true });
  if (!station) throw ApiError.notFound('Station not found');

  if (station.submittedBy.toString() !== requesterId) {
    throw ApiError.forbidden('You are not authorized to update this station');
  }

  const { name, description, addressString, lat: inputLat, lng: inputLng, connectors, solarPanelKw, amenities, images, operatingHours } = input;

  if (name !== undefined) station.name = name;
  if (description !== undefined) station.description = description;
  if (connectors !== undefined) station.connectors = connectors;
  if (solarPanelKw !== undefined) station.solarPanelKw = solarPanelKw;
  if (amenities !== undefined) station.amenities = amenities;
  if (images !== undefined) station.images = images;
  if (operatingHours !== undefined) station.operatingHours = operatingHours;

  if (addressString) {
    try {
      const geo = await forwardGeocode(addressString);
      if (geo) {
        station.location = { type: 'Point', coordinates: [geo.lng, geo.lat] };
        station.address = { street: geo.street, city: geo.city, district: geo.district, country: geo.country, postalCode: geo.postalCode, formattedAddress: geo.formattedAddress };
        station.geocodePending = false;
      } else { station.geocodePending = true; }
    } catch { station.geocodePending = true; }
  } else if (inputLat !== undefined && inputLng !== undefined) {
    station.location = { type: 'Point', coordinates: [inputLng, inputLat] };
    station.geocodePending = false;
    try {
      const geo = await reverseGeocode(inputLat, inputLng);
      if (geo) station.address = { street: geo.street, city: geo.city, district: geo.district, country: geo.country, postalCode: geo.postalCode, formattedAddress: geo.formattedAddress };
    } catch {
      logger.warn(`[stations] Reverse geocoding failed for station update (${station._id})`);
    }
  }

  await station.save();
  logger.info(`[stations] Updated: "${station.name}" (${station._id}) by ${requesterId}`);
  return station;
}

export async function approveStation(id: string, moderatorId: string): Promise<IStation> {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Station not found');

  const station = await Station.findOne({ _id: id, isActive: true });
  if (!station) throw ApiError.notFound('Station not found');
  if (station.status !== 'pending') throw ApiError.badRequest(`Cannot approve a station with status "${station.status}". Only pending stations can be approved.`);

  station.status = 'active';
  station.isVerified = true;
  station.verifiedBy = new Types.ObjectId(moderatorId);
  station.verifiedAt = new Date();
  station.rejectionReason = null;
  await station.save();

  logger.info(`[stations] Approved: "${station.name}" (${station._id}) by ${moderatorId}`);
  return station;
}

export async function rejectStation(id: string, rejectionReason: string, moderatorId: string): Promise<IStation> {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Station not found');

  const station = await Station.findOne({ _id: id, isActive: true });
  if (!station) throw ApiError.notFound('Station not found');
  if (station.status !== 'pending') throw ApiError.badRequest(`Cannot reject a station with status "${station.status}". Only pending stations can be rejected.`);

  station.status = 'rejected';
  station.rejectionReason = rejectionReason;
  await station.save();

  logger.info(`[stations] Rejected: "${station.name}" (${station._id}) by ${moderatorId}. Reason: ${rejectionReason}`);
  return station;
}

export async function deleteStation(id: string, deletedById: string): Promise<void> {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Station not found');

  const station = await Station.findOne({ _id: id, isActive: true });
  if (!station) throw ApiError.notFound('Station not found');

  station.isActive = false;
  station.deletedAt = new Date();
  station.deletedBy = new Types.ObjectId(deletedById);
  await station.save();

  logger.info(`[stations] Soft-deleted: "${station.name}" (${station._id}) by ${deletedById}`);
}

export async function featureStation(id: string, moderatorId: string): Promise<IStation> {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Station not found');

  const station = await Station.findOne({ _id: id, isActive: true });
  if (!station) throw ApiError.notFound('Station not found');
  if (station.status !== 'active') throw ApiError.badRequest('Only active stations can be featured');

  station.isFeatured = !station.isFeatured;
  await station.save();

  logger.info(`[stations] ${station.isFeatured ? 'Featured' : 'Unfeatured'}: "${station.name}" (${station._id}) by ${moderatorId}`);
  return station;
}

export async function getStationStats(id: string) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Station not found');

  const station = await Station.findOne({ _id: id, isActive: true })
    .select('name status averageRating reviewCount isFeatured isVerified geocodePending verifiedAt createdAt updatedAt').lean();

  if (!station) throw ApiError.notFound('Station not found');

  return {
    stationId:     (station._id as Types.ObjectId).toString(),
    name:          station.name,
    status:        station.status,
    averageRating: station.averageRating,
    reviewCount:   station.reviewCount,
    isFeatured:    station.isFeatured,
    isVerified:    station.isVerified,
    geocodePending:station.geocodePending,
    verifiedAt:    station.verifiedAt,
    createdAt:     station.createdAt,
    updatedAt:     station.updatedAt,
  };
}
