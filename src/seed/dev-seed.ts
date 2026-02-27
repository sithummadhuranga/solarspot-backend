import mongoose, { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI     = process.env.MONGODB_URI as string;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? 'solarspot';
const JWT_SECRET      = process.env.JWT_SECRET as string;

if (!MONGODB_URI || !JWT_SECRET) {
  console.error('❌  MONGODB_URI and JWT_SECRET must be set in .env');
  process.exit(1);
}

import { Role } from '@modules/permissions/role.model';
import { User } from '@modules/users/user.model';
import { Station } from '@modules/stations/station.model';


const ROLES = [
  { name: 'guest',                displayName: 'Visitor',              roleLevel: 0, isSystem: true  },
  { name: 'user',                 displayName: 'Member',               roleLevel: 1, isSystem: true  },
  { name: 'station_owner',        displayName: 'Station Owner',        roleLevel: 2, isSystem: false },
  { name: 'featured_contributor', displayName: 'Featured Contributor', roleLevel: 2, isSystem: false },
  { name: 'trusted_reviewer',     displayName: 'Trusted Reviewer',     roleLevel: 2, isSystem: false },
  { name: 'review_moderator',     displayName: 'Review Moderator',     roleLevel: 3, isSystem: false },
  { name: 'weather_analyst',      displayName: 'Weather Analyst',      roleLevel: 3, isSystem: false },
  { name: 'permission_auditor',   displayName: 'Permission Auditor',   roleLevel: 3, isSystem: false },
  { name: 'moderator',            displayName: 'Moderator',            roleLevel: 3, isSystem: true  },
  { name: 'admin',                displayName: 'Administrator',        roleLevel: 4, isSystem: true  },
];

const DEMO_USERS = [
  { email: 'admin@solarspot.app',  password: 'Admin@2026!',  roleName: 'admin',         displayName: 'Admin User',    isEmailVerified: true  },
  { email: 'mod@solarspot.app',    password: 'Mod@2026!',    roleName: 'moderator',     displayName: 'Mod User',      isEmailVerified: true  },
  { email: 'owner@solarspot.app',  password: 'Owner@2026!',  roleName: 'station_owner', displayName: 'Station Owner', isEmailVerified: true  },
  { email: 'user@solarspot.app',   password: 'User@2026!',   roleName: 'user',          displayName: 'Regular User',  isEmailVerified: true  },
];

function makeStations(ownerIdObj: Types.ObjectId, adminIdObj: Types.ObjectId) {
  return [
    {
      name: 'SolarSpot - Galle Face Colombo',
      description: 'Premium solar charging hub near Galle Face Green with oceanfront parking.',
      location: { type: 'Point' as const, coordinates: [79.8432, 6.9177] },
      geocodePending: false,
      address: { street: 'Galle Road', city: 'Colombo', district: 'Colombo', country: 'Sri Lanka', postalCode: '00300', formattedAddress: 'Galle Road, Colombo 3, Sri Lanka' },
      submittedBy: ownerIdObj,
      connectors: [
        { type: 'CCS'    as const, powerKw: 50,  count: 2 },
        { type: 'Type-2' as const, powerKw: 22,  count: 4 },
        { type: 'USB-C'  as const, powerKw: 3.5, count: 6 },
      ],
      solarPanelKw: 120,
      amenities: ['wifi', 'cafe', 'restroom', 'parking', 'security', 'shade'],
      images: [
        'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80',
      ],
      operatingHours: { alwaysOpen: true, schedule: [] },
      status: 'active' as const,
      isVerified: true,
      verifiedBy: adminIdObj,
      verifiedAt: new Date('2026-01-10'),
      isFeatured: true,
      averageRating: 4.8,
      reviewCount: 42,
    },
    {
      name: 'SolarSpot - Kandy City Centre',
      description: 'Solar charging station in the heart of Kandy, close to the Temple of the Tooth.',
      location: { type: 'Point' as const, coordinates: [80.6337, 7.2906] },
      geocodePending: false,
      address: { street: 'Dalada Veediya', city: 'Kandy', district: 'Kandy', country: 'Sri Lanka', postalCode: '20000', formattedAddress: 'Dalada Veediya, Kandy, Sri Lanka' },
      submittedBy: ownerIdObj,
      connectors: [
        { type: 'CCS'    as const, powerKw: 50, count: 2 },
        { type: 'Type-2' as const, powerKw: 22, count: 3 },
      ],
      solarPanelKw: 80,
      amenities: ['wifi', 'parking', 'restroom', 'shade'],
      images: [
        'https://images.unsplash.com/photo-1625221175480-9e17e27c18f0?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1611365892117-00ac5ef43c90?auto=format&fit=crop&w=800&q=80',
      ],
      operatingHours: { alwaysOpen: false, schedule: [
        { day: 'Mon' as const, openTime: '07:00', closeTime: '21:00' },
        { day: 'Tue' as const, openTime: '07:00', closeTime: '21:00' },
        { day: 'Wed' as const, openTime: '07:00', closeTime: '21:00' },
        { day: 'Thu' as const, openTime: '07:00', closeTime: '21:00' },
        { day: 'Fri' as const, openTime: '07:00', closeTime: '21:00' },
        { day: 'Sat' as const, openTime: '08:00', closeTime: '20:00' },
        { day: 'Sun' as const, openTime: '09:00', closeTime: '18:00' },
      ]},
      status: 'active' as const,
      isVerified: true,
      verifiedBy: adminIdObj,
      verifiedAt: new Date('2026-01-15'),
      isFeatured: true,
      averageRating: 4.5,
      reviewCount: 28,
    },
    {
      name: 'SolarSpot - Galle Fort',
      description: 'Historic district solar EV charger adjacent to Galle Fort walls.',
      location: { type: 'Point' as const, coordinates: [80.2170, 6.0269] },
      geocodePending: false,
      address: { street: 'Church Street', city: 'Galle', district: 'Galle', country: 'Sri Lanka', postalCode: '80000', formattedAddress: 'Church Street, Galle Fort, Sri Lanka' },
      submittedBy: ownerIdObj,
      connectors: [
        { type: 'Type-2'  as const, powerKw: 22, count: 4 },
        { type: 'AC-Socket' as const, powerKw: 3.6, count: 4 },
      ],
      solarPanelKw: 60,
      amenities: ['wifi', 'cafe', 'shade', 'parking'],
      images: [
        'https://images.unsplash.com/photo-1564769625905-50e93615e769?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=800&q=80',
      ],
      operatingHours: { alwaysOpen: false, schedule: [
        { day: 'Mon' as const, openTime: '08:00', closeTime: '20:00' },
        { day: 'Tue' as const, openTime: '08:00', closeTime: '20:00' },
        { day: 'Wed' as const, openTime: '08:00', closeTime: '20:00' },
        { day: 'Thu' as const, openTime: '08:00', closeTime: '20:00' },
        { day: 'Fri' as const, openTime: '08:00', closeTime: '22:00' },
        { day: 'Sat' as const, openTime: '08:00', closeTime: '22:00' },
        { day: 'Sun' as const, openTime: '09:00', closeTime: '19:00' },
      ]},
      status: 'active' as const,
      isVerified: true,
      verifiedBy: adminIdObj,
      verifiedAt: new Date('2026-01-20'),
      isFeatured: false,
      averageRating: 4.3,
      reviewCount: 19,
    },
    {
      name: 'SolarSpot - Negombo Beach Road',
      description: 'Beachfront solar charging stop near Negombo lagoon, popular with tourists.',
      location: { type: 'Point' as const, coordinates: [79.8380, 7.2094] },
      geocodePending: false,
      address: { street: 'Lewis Place', city: 'Negombo', district: 'Gampaha', country: 'Sri Lanka', postalCode: '11500', formattedAddress: 'Lewis Place, Negombo, Sri Lanka' },
      submittedBy: ownerIdObj,
      connectors: [
        { type: 'CCS'    as const, powerKw: 50, count: 1 },
        { type: 'Type-2' as const, powerKw: 22, count: 2 },
        { type: 'USB-C'  as const, powerKw: 3.5, count: 4 },
      ],
      solarPanelKw: 50,
      amenities: ['wifi', 'restroom', 'parking', 'water'],
      images: [
        'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1548613053-22087dd8edb8?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=800&q=80',
      ],
      operatingHours: { alwaysOpen: true, schedule: [] },
      status: 'active' as const,
      isVerified: true,
      verifiedBy: adminIdObj,
      verifiedAt: new Date('2026-02-01'),
      isFeatured: false,
      averageRating: 4.1,
      reviewCount: 11,
    },
    {
      name: 'SolarSpot - Anuradhapura Heritage',
      description: 'Solar charging station near the ancient Anuradhapura ruins, zero-emission pilgrimage access.',
      location: { type: 'Point' as const, coordinates: [80.4037, 8.3114] },
      geocodePending: false,
      address: { street: 'Maithripala Senanayake Mawatha', city: 'Anuradhapura', district: 'Anuradhapura', country: 'Sri Lanka', postalCode: '50000', formattedAddress: 'Anuradhapura, North Central Province, Sri Lanka' },
      submittedBy: ownerIdObj,
      connectors: [
        { type: 'Type-2'    as const, powerKw: 22, count: 3 },
        { type: 'AC-Socket' as const, powerKw: 3.6, count: 4 },
      ],
      solarPanelKw: 75,
      amenities: ['parking', 'restroom', 'shade', 'water', 'security'],
      images: [
        'https://images.unsplash.com/photo-1611365892117-00ac5ef43c90?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=80',
      ],
      operatingHours: { alwaysOpen: false, schedule: [
        { day: 'Mon' as const, openTime: '06:00', closeTime: '20:00' },
        { day: 'Tue' as const, openTime: '06:00', closeTime: '20:00' },
        { day: 'Wed' as const, openTime: '06:00', closeTime: '20:00' },
        { day: 'Thu' as const, openTime: '06:00', closeTime: '20:00' },
        { day: 'Fri' as const, openTime: '06:00', closeTime: '20:00' },
        { day: 'Sat' as const, openTime: '06:00', closeTime: '20:00' },
        { day: 'Sun' as const, openTime: '06:00', closeTime: '20:00' },
      ]},
      status: 'active' as const,
      isVerified: true,
      verifiedBy: adminIdObj,
      verifiedAt: new Date('2026-02-05'),
      isFeatured: false,
      averageRating: 3.9,
      reviewCount: 7,
    },
    {
      name: 'SolarSpot - Ratnapura Gem City',
      description: 'High-capacity solar charger serving the gem-mining hub of Sri Lanka.',
      location: { type: 'Point' as const, coordinates: [80.3992, 6.6828] },
      geocodePending: false,
      address: { street: 'Main Street', city: 'Ratnapura', district: 'Ratnapura', country: 'Sri Lanka', postalCode: '70000', formattedAddress: 'Main Street, Ratnapura, Sri Lanka' },
      submittedBy: ownerIdObj,
      connectors: [
        { type: 'CCS'    as const, powerKw: 100, count: 2 },
        { type: 'CHAdeMO' as const, powerKw: 50,  count: 1 },
        { type: 'Type-2'  as const, powerKw: 22,  count: 2 },
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
      status: 'active' as const,
      isVerified: true,
      verifiedBy: adminIdObj,
      verifiedAt: new Date('2026-02-10'),
      isFeatured: false,
      averageRating: 4.6,
      reviewCount: 15,
    },

    {
      name: 'SolarSpot - Trincomalee Harbour',
      description: 'Proposed solar charging hub at the historic Trincomalee natural harbour.',
      location: { type: 'Point' as const, coordinates: [81.2340, 8.5922] },
      geocodePending: false,
      address: { street: 'Harbour Road', city: 'Trincomalee', district: 'Trincomalee', country: 'Sri Lanka', postalCode: '31000', formattedAddress: 'Harbour Road, Trincomalee, Sri Lanka' },
      submittedBy: ownerIdObj,
      connectors: [
        { type: 'Type-2' as const, powerKw: 22, count: 4 },
        { type: 'USB-C'  as const, powerKw: 3.5, count: 6 },
      ],
      solarPanelKw: 90,
      amenities: ['wifi', 'parking', 'restroom', 'water'],
      images: [
        'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=800&q=80',
      ],
      operatingHours: { alwaysOpen: false, schedule: [
        { day: 'Mon' as const, openTime: '07:00', closeTime: '20:00' },
        { day: 'Tue' as const, openTime: '07:00', closeTime: '20:00' },
        { day: 'Wed' as const, openTime: '07:00', closeTime: '20:00' },
        { day: 'Thu' as const, openTime: '07:00', closeTime: '20:00' },
        { day: 'Fri' as const, openTime: '07:00', closeTime: '20:00' },
        { day: 'Sat' as const, openTime: '08:00', closeTime: '18:00' },
        { day: 'Sun' as const, openTime: '08:00', closeTime: '18:00' },
      ]},
      status: 'pending' as const,
      isVerified: false,
      verifiedBy: null,
      verifiedAt: null,
      isFeatured: false,
      averageRating: 0,
      reviewCount: 0,
    },
    {
      name: 'SolarSpot - Kurunegala Rock Fort',
      description: 'Solar station near Kurunegala town centre, serving the North Western Province.',
      location: { type: 'Point' as const, coordinates: [80.3624, 7.4867] },
      geocodePending: false,
      address: { street: 'Colombo Road', city: 'Kurunegala', district: 'Kurunegala', country: 'Sri Lanka', postalCode: '60000', formattedAddress: 'Colombo Road, Kurunegala, Sri Lanka' },
      submittedBy: ownerIdObj,
      connectors: [
        { type: 'CCS'    as const, powerKw: 50, count: 1 },
        { type: 'Type-2' as const, powerKw: 22, count: 2 },
      ],
      solarPanelKw: 45,
      amenities: ['parking', 'shade'],
      images: [
        'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80',
      ],
      operatingHours: { alwaysOpen: false, schedule: [
        { day: 'Mon' as const, openTime: '08:00', closeTime: '19:00' },
        { day: 'Tue' as const, openTime: '08:00', closeTime: '19:00' },
        { day: 'Wed' as const, openTime: '08:00', closeTime: '19:00' },
        { day: 'Thu' as const, openTime: '08:00', closeTime: '19:00' },
        { day: 'Fri' as const, openTime: '08:00', closeTime: '19:00' },
        { day: 'Sat' as const, openTime: '09:00', closeTime: '17:00' },
      ]},
      status: 'pending' as const,
      isVerified: false,
      verifiedBy: null,
      verifiedAt: null,
      isFeatured: false,
      averageRating: 0,
      reviewCount: 0,
    },
    {
      name: 'SolarSpot - Jaffna Point Pedro',
      description: 'Northern Sri Lanka first solar charging station, supporting green energy in Jaffna.',
      location: { type: 'Point' as const, coordinates: [80.0067, 9.6615] },
      geocodePending: false,
      address: { street: 'Hospital Road', city: 'Jaffna', district: 'Jaffna', country: 'Sri Lanka', postalCode: '40000', formattedAddress: 'Hospital Road, Jaffna, Northern Province, Sri Lanka' },
      submittedBy: ownerIdObj,
      connectors: [
        { type: 'Type-2'    as const, powerKw: 22, count: 3 },
        { type: 'AC-Socket' as const, powerKw: 3.6, count: 4 },
        { type: 'USB-C'     as const, powerKw: 3.5, count: 4 },
      ],
      solarPanelKw: 70,
      amenities: ['wifi', 'parking', 'security', 'water'],
      images: [
        'https://images.unsplash.com/photo-1548613053-22087dd8edb8?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1611365892117-00ac5ef43c90?auto=format&fit=crop&w=800&q=80',
      ],
      operatingHours: { alwaysOpen: true, schedule: [] },
      status: 'pending' as const,
      isVerified: false,
      verifiedBy: null,
      verifiedAt: null,
      isFeatured: false,
      averageRating: 0,
      reviewCount: 0,
    },

    {
      name: 'SolarSpot - Batticaloa Lagoon',
      description: 'Solar charging station proposed near Batticaloa Lagoon.',
      location: { type: 'Point' as const, coordinates: [81.6924, 7.7170] },
      geocodePending: false,
      address: { street: 'Bar Road', city: 'Batticaloa', district: 'Batticaloa', country: 'Sri Lanka', postalCode: '30000', formattedAddress: 'Bar Road, Batticaloa, Eastern Province, Sri Lanka' },
      submittedBy: ownerIdObj,
      connectors: [
        { type: 'Type-2' as const, powerKw: 22, count: 2 },
      ],
      solarPanelKw: 20,
      amenities: ['parking'],
      images: [
        'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=80',
      ],
      operatingHours: { alwaysOpen: false, schedule: [
        { day: 'Mon' as const, openTime: '09:00', closeTime: '17:00' },
        { day: 'Sat' as const, openTime: '09:00', closeTime: '15:00' },
      ]},
      status: 'rejected' as const,
      isVerified: false,
      verifiedBy: null,
      verifiedAt: null,
      rejectionReason: 'Insufficient solar panel capacity (20 kW) for the proposed 2 connectors. Minimum 30 kW required. Please resubmit with upgraded panel specifications.',
      isFeatured: false,
      averageRating: 0,
      reviewCount: 0,
    },
  ];
}


async function run(): Promise<void> {
  console.log('\n🌱  SolarSpot dev seed — connecting to MongoDB...\n');
  await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });

  console.log('📋  Seeding roles...');
  for (const r of ROLES) {
    await Role.findOneAndUpdate({ name: r.name }, r, { upsert: true, new: true });
  }
  console.log(`    ✓ ${ROLES.length} roles upserted`);

  const roleMap = new Map<string, Types.ObjectId>();
  const allRoles = await Role.find().lean();
  for (const r of allRoles) roleMap.set(r.name, r._id as Types.ObjectId);

  console.log('\n👤  Seeding users...');
  type CreatedUser = { _id: Types.ObjectId; email: string; roleName: string; displayName: string };
  const createdUsers: CreatedUser[] = [];

  for (const u of DEMO_USERS) {
    await User.deleteOne({ email: u.email });
    const roleId = roleMap.get(u.roleName);
    if (!roleId) { console.warn(`    ⚠  Role not found: ${u.roleName}`); continue; }

    const user = await new User({
      email:           u.email,
      password:        u.password,   
      displayName:     u.displayName,
      role:            roleId,
      isEmailVerified: u.isEmailVerified,
      isActive:        true,
      isBanned:        false,
    }).save();

    createdUsers.push({ _id: user._id as Types.ObjectId, email: user.email, roleName: u.roleName, displayName: u.displayName });
    console.log(`    ✓ ${u.roleName.padEnd(16)} ${u.email}`);
  }

  console.log('\n⚡  Seeding stations...');
  const owner = createdUsers.find(u => u.roleName === 'station_owner');
  const admin = createdUsers.find(u => u.roleName === 'admin');

  if (!owner || !admin) {
    console.error('❌  Could not find owner/admin users for station seed');
    process.exit(1);
  }

  await Station.deleteMany({ name: /^SolarSpot -/ });

  const stationData = makeStations(owner._id, admin._id);
  const insertedStations = await Station.insertMany(stationData);
  console.log(`    ✓ ${insertedStations.length} stations created`);

  const statusCounts = stationData.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`      ${count}x ${status}`);
  }

  console.log('\n🔑  JWT Tokens (7-day expiry) — paste into Postman Bearer Token:\n');
  console.log('─'.repeat(80));

  for (const u of createdUsers) {
    const token = jwt.sign({ id: u._id.toString() }, JWT_SECRET, { expiresIn: '7d' });
    console.log(`\n  ${u.roleName.toUpperCase()} — ${u.email}`);
    console.log(`  Password: ${DEMO_USERS.find(d => d.email === u.email)?.password}`);
    console.log(`  User ID:  ${u._id}`);
    console.log(`  Token:\n  ${token}`);
  }

  console.log('\n' + '─'.repeat(80));

  console.log('\n📍  Station IDs for Postman:\n');
  for (const s of insertedStations) {
    const data = stationData[insertedStations.indexOf(s)];
    console.log(`  [${data.status.toUpperCase().padEnd(8)}] ${data.name.padEnd(40)} ${s._id}`);
  }

  console.log('\n✅  Seed complete!\n');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
