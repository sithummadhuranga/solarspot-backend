/**
 * Seeder 07 — demo_reviews
 *
 * Owner: Member 2
 * Owner: Member 4 — runs this as part of the seed pipeline.
 *
 * Seeds sample reviews against demo stations.
 * Depends on: 05_demo_users, 06_demo_stations
 *
 * ⚠️  DEV ONLY — never run seed:demo in production.
 */

import { ClientSession, Types } from 'mongoose';
import { Review } from '@modules/reviews/review.model';
import { Station } from '@modules/stations/station.model';
import { User } from '@modules/users/user.model';
import logger from '@utils/logger';

interface DemoReviewSeed {
  authorEmail: string;
  stationName: string;
  rating: number;
  title: string;
  content: string;
  moderationStatus: 'approved' | 'pending' | 'rejected' | 'flagged';
  isFlagged?: boolean;
  helpfulCount?: number;
}

export const DEMO_REVIEWS: DemoReviewSeed[] = [
  {
    authorEmail: 'user@solarspot.app',
    stationName: 'SolarSpot - Galle Face Colombo',
    rating: 5,
    title: 'Incredible charging experience',
    content: 'Excellent solar station! Charged my EV in under 2 hours. The oceanfront location makes the wait enjoyable. Highly recommend the CCS connectors — very fast.',
    moderationStatus: 'approved',
    helpfulCount: 12,
  },
  {
    authorEmail: 'mod@solarspot.app',
    stationName: 'SolarSpot - Galle Face Colombo',
    rating: 4,
    title: 'Great location, slightly crowded',
    content: 'The station is wonderful with excellent amenities. Only downside is it gets busy on weekends. The cafe nearby is a nice touch while waiting.',
    moderationStatus: 'approved',
    helpfulCount: 8,
  },
  {
    authorEmail: 'user@solarspot.app',
    stationName: 'SolarSpot - Kandy City Centre',
    rating: 4,
    title: 'Convenient city centre charging',
    content: 'Very convenient location near the Temple of the Tooth. Good charging speeds and clean facilities. Parking can be tight during peak hours.',
    moderationStatus: 'approved',
    helpfulCount: 5,
  },
  {
    authorEmail: 'admin@solarspot.app',
    stationName: 'SolarSpot - Kandy City Centre',
    rating: 5,
    title: 'Best station in Kandy',
    content: 'This is hands down the best solar charging station in the Kandy area. Fast chargers, reliable service, and the staff are incredibly helpful.',
    moderationStatus: 'approved',
    helpfulCount: 15,
  },
  {
    authorEmail: 'mod@solarspot.app',
    stationName: 'SolarSpot - Kandy City Centre',
    rating: 3,
    title: 'Decent but room for improvement',
    content: 'The station works well for basic charging needs. Would love to see more connector types and extended operating hours on weekends.',
    moderationStatus: 'approved',
    helpfulCount: 3,
  },
  {
    authorEmail: 'user@solarspot.app',
    stationName: 'SolarSpot - Galle Fort Heritage',
    rating: 5,
    title: 'Perfect heritage location',
    content: 'Charging your EV right by the Galle Fort — what an experience! The solar panels blend beautifully with the heritage area. Fast and reliable.',
    moderationStatus: 'approved',
    helpfulCount: 20,
  },
  {
    authorEmail: 'admin@solarspot.app',
    stationName: 'SolarSpot - Galle Fort Heritage',
    rating: 4,
    title: 'Scenic and functional',
    content: 'Beautiful location with good charging infrastructure. The shade from solar panels is a bonus on hot days. Restroom facilities could be improved.',
    moderationStatus: 'approved',
    helpfulCount: 7,
  },
  {
    authorEmail: 'mod@solarspot.app',
    stationName: 'SolarSpot - Negombo Beach',
    rating: 2,
    title: 'Needs maintenance',
    content: 'One of the USB-C chargers was not working during my visit. The location is great but the equipment needs better upkeep. Reported to management.',
    moderationStatus: 'flagged',
    isFlagged: true,
  },
];

export async function seedDemoReviews(session: ClientSession): Promise<void> {
  // Resolve user emails to ObjectIds
  const users = await User.find({ email: { $in: DEMO_REVIEWS.map((r) => r.authorEmail) } })
    .select('_id email')
    .lean();
  const userMap = new Map(users.map((u) => [u.email, u._id as Types.ObjectId]));

  // Resolve station names to ObjectIds
  const stationNames = [...new Set(DEMO_REVIEWS.map((r) => r.stationName))];
  const stations = await Station.find({ name: { $in: stationNames } })
    .select('_id name')
    .lean();
  const stationMap = new Map(stations.map((s) => [s.name, s._id as Types.ObjectId]));

  let seeded = 0;
  for (const demo of DEMO_REVIEWS) {
    const authorId  = userMap.get(demo.authorEmail);
    const stationId = stationMap.get(demo.stationName);

    if (!authorId) {
      logger.warn(`⚠️  seedDemoReviews: user "${demo.authorEmail}" not found — skipping`);
      continue;
    }
    if (!stationId) {
      logger.warn(`⚠️  seedDemoReviews: station "${demo.stationName}" not found — skipping`);
      continue;
    }

    await Review.findOneAndUpdate(
      { station: stationId, author: authorId },
      {
        $set: {
          rating:           demo.rating,
          title:            demo.title,
          content:          demo.content,
          moderationStatus: demo.moderationStatus,
          isFlagged:        demo.isFlagged ?? false,
          helpfulCount:     demo.helpfulCount ?? 0,
          isActive:         true,
        },
      },
      { upsert: true, returnDocument: 'after', session },
    );
    seeded++;
  }

  // Recalculate averageRating for all stations that received reviews
  for (const [, stationId] of stationMap) {
    const [agg] = await Review.aggregate([
      { $match: { station: stationId, moderationStatus: 'approved', isActive: true } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]).session(session);

    const avgRating = agg ? Math.round(agg.avg * 10) / 10 : 0;
    const count     = agg?.count ?? 0;

    await Station.findByIdAndUpdate(stationId, {
      $set: { averageRating: avgRating, reviewCount: count },
    }, { session });
  }

  logger.info(`✅  demo reviews seeded (${seeded}/${DEMO_REVIEWS.length})`);
}
