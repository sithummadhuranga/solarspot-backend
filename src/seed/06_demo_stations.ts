/**
 * Seeder 06 — demo_stations
 *
 * Owner: Member 1 — implement demo station shapes.
 * Owner: Member 4 — runs this as part of the seed pipeline.
 *
 * Seeds sample solar charging stations across Sri Lanka for development.
 * Depends on: 03_roles, 05_demo_users (stations need a submittedBy user)
 *
 * ⚠️  DEV ONLY — never run seed:demo in production.
 */

import { ClientSession } from 'mongoose';
import { Station } from '@modules/stations/station.model';
import { User } from '@modules/users/user.model';
import logger from '@utils/logger';

type DemoStationSeed = {
  name: string;
  description: string;
  location: { type: 'Point'; coordinates: [number, number] };
  geocodePending: boolean;
  address: {
    street: string;
    city: string;
    district: string;
    country: string;
    postalCode: string;
    formattedAddress: string;
  };
  submittedByEmail: string;
  connectors: Array<{ type: 'USB-C' | 'Type-2' | 'CCS' | 'CHAdeMO' | 'Tesla-NACS' | 'AC-Socket'; powerKw: number; count: number }>;
  solarPanelKw: number;
  amenities: Array<'wifi' | 'cafe' | 'restroom' | 'parking' | 'security' | 'shade' | 'water' | 'repair_shop' | 'ev_parking'>;
  images: string[];
  operatingHours: {
    alwaysOpen: boolean;
    schedule: Array<{ day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'; openTime: string; closeTime: string }>;
  };
  status: 'pending' | 'active' | 'inactive' | 'rejected';
  isVerified: boolean;
  verifiedByEmail: string | null;
  verifiedAt: Date | null;
  rejectionReason?: string;
  isFeatured: boolean;
  averageRating: number;
  reviewCount: number;
};

export const DEMO_STATIONS: DemoStationSeed[] = [
  {
    name: 'SolarSpot - Galle Face Colombo',
    description: 'Premium solar charging hub near Galle Face Green with oceanfront parking.',
    location: { type: 'Point', coordinates: [79.8432, 6.9177] },
    geocodePending: false,
    address: { street: 'Galle Road', city: 'Colombo', district: 'Colombo', country: 'Sri Lanka', postalCode: '00300', formattedAddress: 'Galle Road, Colombo 3, Sri Lanka' },
    submittedByEmail: 'owner@solarspot.app',
    connectors: [
      { type: 'CCS', powerKw: 50, count: 2 },
      { type: 'Type-2', powerKw: 22, count: 4 },
      { type: 'USB-C', powerKw: 3.5, count: 6 },
    ],
    solarPanelKw: 120,
    amenities: ['wifi', 'cafe', 'restroom', 'parking', 'security', 'shade'],
    images: [
      'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80',
    ],
    operatingHours: { alwaysOpen: true, schedule: [] },
    status: 'active',
    isVerified: true,
    verifiedByEmail: 'admin@solarspot.app',
    verifiedAt: new Date('2026-01-10'),
    isFeatured: true,
    averageRating: 4.8,
    reviewCount: 42,
  },
  {
    name: 'SolarSpot - Kandy City Centre',
    description: 'Solar charging station in the heart of Kandy, close to the Temple of the Tooth.',
    location: { type: 'Point', coordinates: [80.6337, 7.2906] },
    geocodePending: false,
    address: { street: 'Dalada Veediya', city: 'Kandy', district: 'Kandy', country: 'Sri Lanka', postalCode: '20000', formattedAddress: 'Dalada Veediya, Kandy, Sri Lanka' },
    submittedByEmail: 'owner@solarspot.app',
    connectors: [
      { type: 'CCS', powerKw: 50, count: 2 },
      { type: 'Type-2', powerKw: 22, count: 3 },
    ],
    solarPanelKw: 80,
    amenities: ['wifi', 'parking', 'restroom', 'shade'],
    images: [
      'https://images.unsplash.com/photo-1625221175480-9e17e27c18f0?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1611365892117-00ac5ef43c90?auto=format&fit=crop&w=800&q=80',
    ],
    operatingHours: { alwaysOpen: false, schedule: [
      { day: 'Mon', openTime: '07:00', closeTime: '21:00' },
      { day: 'Tue', openTime: '07:00', closeTime: '21:00' },
      { day: 'Wed', openTime: '07:00', closeTime: '21:00' },
      { day: 'Thu', openTime: '07:00', closeTime: '21:00' },
      { day: 'Fri', openTime: '07:00', closeTime: '21:00' },
      { day: 'Sat', openTime: '08:00', closeTime: '20:00' },
      { day: 'Sun', openTime: '09:00', closeTime: '18:00' },
    ] },
    status: 'active',
    isVerified: true,
    verifiedByEmail: 'admin@solarspot.app',
    verifiedAt: new Date('2026-01-15'),
    isFeatured: true,
    averageRating: 4.5,
    reviewCount: 28,
  },
  {
    name: 'SolarSpot - Galle Fort',
    description: 'Historic district solar EV charger adjacent to Galle Fort walls.',
    location: { type: 'Point', coordinates: [80.217, 6.0269] },
    geocodePending: false,
    address: { street: 'Church Street', city: 'Galle', district: 'Galle', country: 'Sri Lanka', postalCode: '80000', formattedAddress: 'Church Street, Galle Fort, Sri Lanka' },
    submittedByEmail: 'owner@solarspot.app',
    connectors: [
      { type: 'Type-2', powerKw: 22, count: 4 },
      { type: 'AC-Socket', powerKw: 3.6, count: 4 },
    ],
    solarPanelKw: 60,
    amenities: ['wifi', 'cafe', 'shade', 'parking'],
    images: [
      'https://images.unsplash.com/photo-1564769625905-50e93615e769?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=800&q=80',
    ],
    operatingHours: { alwaysOpen: false, schedule: [
      { day: 'Mon', openTime: '08:00', closeTime: '20:00' },
      { day: 'Tue', openTime: '08:00', closeTime: '20:00' },
      { day: 'Wed', openTime: '08:00', closeTime: '20:00' },
      { day: 'Thu', openTime: '08:00', closeTime: '20:00' },
      { day: 'Fri', openTime: '08:00', closeTime: '22:00' },
      { day: 'Sat', openTime: '08:00', closeTime: '22:00' },
      { day: 'Sun', openTime: '09:00', closeTime: '19:00' },
    ] },
    status: 'active',
    isVerified: true,
    verifiedByEmail: 'admin@solarspot.app',
    verifiedAt: new Date('2026-01-20'),
    isFeatured: false,
    averageRating: 4.3,
    reviewCount: 19,
  },
  {
    name: 'SolarSpot - Negombo Beach Road',
    description: 'Beachfront solar charging stop near Negombo lagoon, popular with tourists.',
    location: { type: 'Point', coordinates: [79.838, 7.2094] },
    geocodePending: false,
    address: { street: 'Lewis Place', city: 'Negombo', district: 'Gampaha', country: 'Sri Lanka', postalCode: '11500', formattedAddress: 'Lewis Place, Negombo, Sri Lanka' },
    submittedByEmail: 'owner@solarspot.app',
    connectors: [
      { type: 'CCS', powerKw: 50, count: 1 },
      { type: 'Type-2', powerKw: 22, count: 2 },
      { type: 'USB-C', powerKw: 3.5, count: 4 },
    ],
    solarPanelKw: 50,
    amenities: ['wifi', 'restroom', 'parking', 'water'],
    images: [
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1548613053-22087dd8edb8?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=800&q=80',
    ],
    operatingHours: { alwaysOpen: true, schedule: [] },
    status: 'active',
    isVerified: true,
    verifiedByEmail: 'admin@solarspot.app',
    verifiedAt: new Date('2026-02-01'),
    isFeatured: false,
    averageRating: 4.1,
    reviewCount: 11,
  },
  {
    name: 'SolarSpot - Anuradhapura Heritage',
    description: 'Solar charging station near the ancient Anuradhapura ruins, zero-emission pilgrimage access.',
    location: { type: 'Point', coordinates: [80.4037, 8.3114] },
    geocodePending: false,
    address: { street: 'Maithripala Senanayake Mawatha', city: 'Anuradhapura', district: 'Anuradhapura', country: 'Sri Lanka', postalCode: '50000', formattedAddress: 'Anuradhapura, North Central Province, Sri Lanka' },
    submittedByEmail: 'owner@solarspot.app',
    connectors: [
      { type: 'Type-2', powerKw: 22, count: 3 },
      { type: 'AC-Socket', powerKw: 3.6, count: 4 },
    ],
    solarPanelKw: 75,
    amenities: ['parking', 'restroom', 'shade', 'water', 'security'],
    images: [
      'https://images.unsplash.com/photo-1611365892117-00ac5ef43c90?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=80',
    ],
    operatingHours: { alwaysOpen: false, schedule: [
      { day: 'Mon', openTime: '06:00', closeTime: '20:00' },
      { day: 'Tue', openTime: '06:00', closeTime: '20:00' },
      { day: 'Wed', openTime: '06:00', closeTime: '20:00' },
      { day: 'Thu', openTime: '06:00', closeTime: '20:00' },
      { day: 'Fri', openTime: '06:00', closeTime: '20:00' },
      { day: 'Sat', openTime: '06:00', closeTime: '20:00' },
      { day: 'Sun', openTime: '06:00', closeTime: '20:00' },
    ] },
    status: 'active',
    isVerified: true,
    verifiedByEmail: 'admin@solarspot.app',
    verifiedAt: new Date('2026-02-05'),
    isFeatured: false,
    averageRating: 3.9,
    reviewCount: 7,
  },
  {
    name: 'SolarSpot - Ratnapura Gem City',
    description: 'High-capacity solar charger serving the gem-mining hub of Sri Lanka.',
    location: { type: 'Point', coordinates: [80.3992, 6.6828] },
    geocodePending: false,
    address: { street: 'Main Street', city: 'Ratnapura', district: 'Ratnapura', country: 'Sri Lanka', postalCode: '70000', formattedAddress: 'Main Street, Ratnapura, Sri Lanka' },
    submittedByEmail: 'owner@solarspot.app',
    connectors: [
      { type: 'CCS', powerKw: 100, count: 2 },
      { type: 'CHAdeMO', powerKw: 50, count: 1 },
      { type: 'Type-2', powerKw: 22, count: 2 },
    ],
    solarPanelKw: 200,
    amenities: ['wifi', 'parking', 'security', 'repair_shop', 'ev_parking'],
    images: [
      'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1548613053-22087dd8edb8?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1611365892117-00ac5ef43c90?auto=format&fit=crop&w=800&q=80',
    ],
    operatingHours: { alwaysOpen: true, schedule: [] },
    status: 'active',
    isVerified: true,
    verifiedByEmail: 'admin@solarspot.app',
    verifiedAt: new Date('2026-02-10'),
    isFeatured: false,
    averageRating: 4.6,
    reviewCount: 15,
  },
  {
    name: 'SolarSpot - Trincomalee Harbour',
    description: 'Proposed solar charging hub at the historic Trincomalee natural harbour.',
    location: { type: 'Point', coordinates: [81.234, 8.5922] },
    geocodePending: false,
    address: { street: 'Harbour Road', city: 'Trincomalee', district: 'Trincomalee', country: 'Sri Lanka', postalCode: '31000', formattedAddress: 'Harbour Road, Trincomalee, Sri Lanka' },
    submittedByEmail: 'owner@solarspot.app',
    connectors: [
      { type: 'Type-2', powerKw: 22, count: 4 },
      { type: 'USB-C', powerKw: 3.5, count: 6 },
    ],
    solarPanelKw: 90,
    amenities: ['wifi', 'parking', 'restroom', 'water'],
    images: [
      'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=800&q=80',
    ],
    operatingHours: { alwaysOpen: false, schedule: [
      { day: 'Mon', openTime: '07:00', closeTime: '20:00' },
      { day: 'Tue', openTime: '07:00', closeTime: '20:00' },
      { day: 'Wed', openTime: '07:00', closeTime: '20:00' },
      { day: 'Thu', openTime: '07:00', closeTime: '20:00' },
      { day: 'Fri', openTime: '07:00', closeTime: '20:00' },
      { day: 'Sat', openTime: '08:00', closeTime: '18:00' },
      { day: 'Sun', openTime: '08:00', closeTime: '18:00' },
    ] },
    status: 'pending',
    isVerified: false,
    verifiedByEmail: null,
    verifiedAt: null,
    isFeatured: false,
    averageRating: 0,
    reviewCount: 0,
  },
  {
    name: 'SolarSpot - Kurunegala Rock Fort',
    description: 'Solar station near Kurunegala town centre, serving the North Western Province.',
    location: { type: 'Point', coordinates: [80.3624, 7.4867] },
    geocodePending: false,
    address: { street: 'Colombo Road', city: 'Kurunegala', district: 'Kurunegala', country: 'Sri Lanka', postalCode: '60000', formattedAddress: 'Colombo Road, Kurunegala, Sri Lanka' },
    submittedByEmail: 'owner@solarspot.app',
    connectors: [
      { type: 'CCS', powerKw: 50, count: 1 },
      { type: 'Type-2', powerKw: 22, count: 2 },
    ],
    solarPanelKw: 45,
    amenities: ['parking', 'shade'],
    images: [
      'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80',
    ],
    operatingHours: { alwaysOpen: false, schedule: [
      { day: 'Mon', openTime: '08:00', closeTime: '19:00' },
      { day: 'Tue', openTime: '08:00', closeTime: '19:00' },
      { day: 'Wed', openTime: '08:00', closeTime: '19:00' },
      { day: 'Thu', openTime: '08:00', closeTime: '19:00' },
      { day: 'Fri', openTime: '08:00', closeTime: '19:00' },
      { day: 'Sat', openTime: '09:00', closeTime: '17:00' },
    ] },
    status: 'pending',
    isVerified: false,
    verifiedByEmail: null,
    verifiedAt: null,
    isFeatured: false,
    averageRating: 0,
    reviewCount: 0,
  },
  {
    name: 'SolarSpot - Jaffna Point Pedro',
    description: 'Northern Sri Lanka first solar charging station, supporting green energy in Jaffna.',
    location: { type: 'Point', coordinates: [80.0067, 9.6615] },
    geocodePending: false,
    address: { street: 'Hospital Road', city: 'Jaffna', district: 'Jaffna', country: 'Sri Lanka', postalCode: '40000', formattedAddress: 'Hospital Road, Jaffna, Northern Province, Sri Lanka' },
    submittedByEmail: 'owner@solarspot.app',
    connectors: [
      { type: 'Type-2', powerKw: 22, count: 3 },
      { type: 'AC-Socket', powerKw: 3.6, count: 4 },
      { type: 'USB-C', powerKw: 3.5, count: 4 },
    ],
    solarPanelKw: 70,
    amenities: ['wifi', 'parking', 'security', 'water'],
    images: [
      'https://images.unsplash.com/photo-1548613053-22087dd8edb8?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1611365892117-00ac5ef43c90?auto=format&fit=crop&w=800&q=80',
    ],
    operatingHours: { alwaysOpen: true, schedule: [] },
    status: 'pending',
    isVerified: false,
    verifiedByEmail: null,
    verifiedAt: null,
    isFeatured: false,
    averageRating: 0,
    reviewCount: 0,
  },
  {
    name: 'SolarSpot - Batticaloa Lagoon',
    description: 'Solar charging station proposed near Batticaloa Lagoon.',
    location: { type: 'Point', coordinates: [81.6924, 7.717] },
    geocodePending: false,
    address: { street: 'Bar Road', city: 'Batticaloa', district: 'Batticaloa', country: 'Sri Lanka', postalCode: '30000', formattedAddress: 'Bar Road, Batticaloa, Eastern Province, Sri Lanka' },
    submittedByEmail: 'owner@solarspot.app',
    connectors: [
      { type: 'Type-2', powerKw: 22, count: 2 },
    ],
    solarPanelKw: 20,
    amenities: ['parking'],
    images: [
      'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=80',
    ],
    operatingHours: { alwaysOpen: false, schedule: [
      { day: 'Mon', openTime: '09:00', closeTime: '17:00' },
      { day: 'Sat', openTime: '09:00', closeTime: '15:00' },
    ] },
    status: 'rejected',
    isVerified: false,
    verifiedByEmail: null,
    verifiedAt: null,
    rejectionReason: 'Insufficient solar panel capacity (20 kW) for the proposed 2 connectors. Minimum 30 kW required. Please resubmit with upgraded panel specifications.',
    isFeatured: false,
    averageRating: 0,
    reviewCount: 0,
  },
];

export async function seedDemoStations(session: ClientSession): Promise<void> {
  const requiredEmails = Array.from(
    new Set(
      DEMO_STATIONS.flatMap((station) =>
        station.verifiedByEmail
          ? [station.submittedByEmail, station.verifiedByEmail]
          : [station.submittedByEmail],
      ),
    ),
  );

  const users = await User.find({ email: { $in: requiredEmails } })
    .select('_id email')
    .session(session)
    .lean();

  const userIdByEmail = new Map(users.map((u) => [u.email, u._id]));

  for (const station of DEMO_STATIONS) {
    const submittedBy = userIdByEmail.get(station.submittedByEmail);
    if (!submittedBy) {
      logger.warn(`⚠️  seedDemoStations: submitter \"${station.submittedByEmail}\" not found — skipping ${station.name}`);
      continue;
    }

    const verifiedBy = station.verifiedByEmail
      ? userIdByEmail.get(station.verifiedByEmail) ?? null
      : null;

    if (station.verifiedByEmail && !verifiedBy) {
      logger.warn(`⚠️  seedDemoStations: verifier \"${station.verifiedByEmail}\" not found — skipping ${station.name}`);
      continue;
    }

    await Station.findOneAndUpdate(
      { name: station.name },
      {
        $set: {
          name: station.name,
          description: station.description,
          location: station.location,
          geocodePending: station.geocodePending,
          address: station.address,
          submittedBy,
          connectors: station.connectors,
          solarPanelKw: station.solarPanelKw,
          amenities: station.amenities,
          images: station.images,
          operatingHours: station.operatingHours,
          status: station.status,
          isVerified: station.isVerified,
          verifiedBy,
          verifiedAt: station.verifiedAt,
          rejectionReason: station.rejectionReason ?? null,
          isFeatured: station.isFeatured,
          averageRating: station.averageRating,
          reviewCount: station.reviewCount,
          isActive: true,
          deletedAt: null,
          deletedBy: null,
        },
      },
      { upsert: true, new: true, session },
    );
  }

  logger.info(`✅  demo stations seeded (${DEMO_STATIONS.length})`);
}
