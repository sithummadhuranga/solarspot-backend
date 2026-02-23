import { Router } from 'express';
import { protect } from '@middleware/auth.middleware';
import { checkPermission } from '@middleware/rbac.middleware';
import { validate } from '@middleware/validate.middleware';
import * as stationController from './station.controller';
import {
  createStationSchema,
  updateStationSchema,
  rejectStationSchema,
  listStationsQuerySchema,
  nearbyQuerySchema,
  searchQuerySchema,
} from './station.validation';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Connector:
 *       type: object
 *       required: [type, powerKw, count]
 *       properties:
 *         type:
 *           type: string
 *           enum: [USB-C, Type-2, CCS, CHAdeMO, Tesla-NACS, AC-Socket]
 *           example: CCS
 *         powerKw:
 *           type: number
 *           minimum: 0.5
 *           maximum: 350
 *           example: 50
 *         count:
 *           type: number
 *           minimum: 1
 *           example: 2
 *
 *     ScheduleEntry:
 *       type: object
 *       required: [day, openTime, closeTime]
 *       properties:
 *         day:
 *           type: string
 *           enum: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
 *         openTime:
 *           type: string
 *           pattern: '^\d{2}:\d{2}$'
 *           example: "08:00"
 *         closeTime:
 *           type: string
 *           pattern: '^\d{2}:\d{2}$'
 *           example: "20:00"
 *
 *     OperatingHours:
 *       type: object
 *       properties:
 *         alwaysOpen:
 *           type: boolean
 *           example: false
 *         schedule:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ScheduleEntry'
 *
 *     StationAddress:
 *       type: object
 *       properties:
 *         street:
 *           type: string
 *           nullable: true
 *           example: "Galle Road"
 *         city:
 *           type: string
 *           nullable: true
 *           example: "Colombo"
 *         district:
 *           type: string
 *           nullable: true
 *           example: "Colombo District"
 *         country:
 *           type: string
 *           nullable: true
 *           example: "Sri Lanka"
 *         postalCode:
 *           type: string
 *           nullable: true
 *           example: "00300"
 *         formattedAddress:
 *           type: string
 *           nullable: true
 *           example: "Galle Road, Colombo 3, Western Province, Sri Lanka"
 *
 *     GeoPoint:
 *       type: object
 *       required: [type, coordinates]
 *       properties:
 *         type:
 *           type: string
 *           enum: [Point]
 *         coordinates:
 *           type: array
 *           items:
 *             type: number
 *           minItems: 2
 *           maxItems: 2
 *           description: "[longitude, latitude]"
 *           example: [79.8612, 6.9271]
 *
 *     Station:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *         name:
 *           type: string
 *           example: "SolarCharge Hub - Colombo"
 *         description:
 *           type: string
 *           nullable: true
 *           example: "Modern solar EV charging station near Galle Face Green"
 *         location:
 *           $ref: '#/components/schemas/GeoPoint'
 *         address:
 *           $ref: '#/components/schemas/StationAddress'
 *         submittedBy:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             displayName:
 *               type: string
 *             avatar:
 *               type: string
 *               nullable: true
 *         connectors:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Connector'
 *         solarPanelKw:
 *           type: number
 *           example: 100
 *         amenities:
 *           type: array
 *           items:
 *             type: string
 *           example: ["wifi", "parking"]
 *         images:
 *           type: array
 *           items:
 *             type: string
 *           example: ["https://res.cloudinary.com/solarspot/image/upload/v1/station1.jpg"]
 *         operatingHours:
 *           $ref: '#/components/schemas/OperatingHours'
 *         status:
 *           type: string
 *           enum: [pending, active, inactive, rejected]
 *           example: active
 *         isVerified:
 *           type: boolean
 *           example: true
 *         isFeatured:
 *           type: boolean
 *           example: false
 *         averageRating:
 *           type: number
 *           example: 4.2
 *         reviewCount:
 *           type: number
 *           example: 18
 *         isActive:
 *           type: boolean
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     StationNearby:
 *       allOf:
 *         - $ref: '#/components/schemas/Station'
 *         - type: object
 *           properties:
 *             distanceKm:
 *               type: number
 *               description: Distance from the query coordinate in kilometres
 *               example: 1.43
 *
 *     CreateStationBody:
 *       type: object
 *       required: [name, connectors, solarPanelKw]
 *       properties:
 *         name:
 *           type: string
 *           minLength: 3
 *           maxLength: 100
 *           example: "SolarCharge Hub - Colombo"
 *         description:
 *           type: string
 *           maxLength: 1000
 *           example: "Modern solar EV charging station near Galle Face Green"
 *         addressString:
 *           type: string
 *           description: "Free-form address for forward geocoding (required if lat/lng absent)"
 *           example: "Galle Road, Colombo 3, Sri Lanka"
 *         lat:
 *           type: number
 *           description: "Latitude – use with lng for reverse geocoding (required if addressString absent)"
 *           example: 6.9271
 *         lng:
 *           type: number
 *           description: "Longitude – use with lat for reverse geocoding"
 *           example: 79.8612
 *         connectors:
 *           type: array
 *           minItems: 1
 *           items:
 *             $ref: '#/components/schemas/Connector'
 *         solarPanelKw:
 *           type: number
 *           minimum: 0.1
 *           maximum: 10000
 *           example: 100
 *         amenities:
 *           type: array
 *           items:
 *             type: string
 *             enum: [wifi, cafe, restroom, parking, security, shade, water, repair_shop, ev_parking]
 *           example: ["wifi", "parking"]
 *         images:
 *           type: array
 *           maxItems: 5
 *           items:
 *             type: string
 *             format: uri
 *         operatingHours:
 *           $ref: '#/components/schemas/OperatingHours'
 *
 *     RejectStationBody:
 *       type: object
 *       required: [rejectionReason]
 *       properties:
 *         rejectionReason:
 *           type: string
 *           minLength: 10
 *           maxLength: 500
 *           example: "Insufficient information about connector power levels."
 */

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/stations:
 *   get:
 *     summary: List all active stations
 *     description: >
 *       Returns a paginated list of active stations. Supports full-text search,
 *       geo-radius filtering, connector type, minimum rating, verified-only, and
 *       amenity filters. Combine lat+lng+radius to restrict results to a circular area
 *       ($geoWithin / $centerSphere). Soft-deleted stations are always excluded.
 *     tags:
 *       - Stations
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Results per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Full-text search across name, description, and city
 *         example: "solar colombo"
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *         description: Latitude for geo-radius filter (requires lng and radius)
 *         example: 6.9271
 *       - in: query
 *         name: lng
 *         schema:
 *           type: number
 *         description: Longitude for geo-radius filter (requires lat and radius)
 *         example: 79.8612
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           default: 25
 *         description: Search radius in kilometres (used with lat+lng)
 *         example: 10
 *       - in: query
 *         name: connectorType
 *         schema:
 *           type: string
 *           enum: [USB-C, Type-2, CCS, CHAdeMO, Tesla-NACS, AC-Socket]
 *         description: Filter by available connector type
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 5
 *         description: Minimum average rating
 *         example: 3.5
 *       - in: query
 *         name: isVerified
 *         schema:
 *           type: boolean
 *         description: Filter by verification status
 *       - in: query
 *         name: amenities
 *         schema:
 *           type: string
 *         description: Comma-separated amenities required (e.g. wifi,parking)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [newest, rating, distance, featured]
 *           default: newest
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Paginated list of stations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Stations retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Station'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       422:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.get('/', validate(listStationsQuerySchema, 'query'), stationController.listStations);

/**
 * @swagger
 * /api/stations/nearby:
 *   get:
 *     summary: Find stations near a coordinate
 *     description: >
 *       Returns stations within `radius` km of the supplied lat/lng, sorted
 *       by proximity. Each result includes a `distanceKm` field computed via
 *       MongoDB $geoNear aggregation. Soft-deleted and non-active stations are excluded.
 *     tags:
 *       - Stations
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *         description: Latitude of the centre point
 *         example: 6.9271
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *         description: Longitude of the centre point
 *         example: 79.8612
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           default: 10
 *         description: Search radius in kilometres (max 500)
 *         example: 5
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Maximum results to return
 *     responses:
 *       200:
 *         description: Array of nearby stations with distanceKm
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Nearby stations retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/StationNearby'
 *       400:
 *         description: Missing or invalid coordinates
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.get('/nearby', validate(nearbyQuerySchema, 'query'), stationController.getNearbyStations);

/**
 * @swagger
 * /api/stations/search:
 *   get:
 *     summary: Full-text search for stations
 *     description: >
 *       Dedicated search endpoint. Requires a query string `q`. Results are ranked
 *       by MongoDB text-search score (name ×3, city ×2, description ×1), then by
 *       the chosen sort. Only active stations are returned.
 *     tags:
 *       - Stations
 *     x-permission: stations.read
 *     x-component: stations
 *     x-min-role: 0
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 200
 *         description: Search query string
 *         example: "solar colombo"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [newest, rating, featured]
 *           default: newest
 *     responses:
 *       200:
 *         description: Paginated search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Stations retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Station'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       422:
 *         description: Validation error — q is missing or too short
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.get('/search', validate(searchQuerySchema, 'query'), stationController.searchStations);

/**
 * @swagger
 * /api/stations/pending:
 *   get:
 *     summary: Get the moderation queue (pending stations)
 *     description: >
 *       Returns stations with status `pending`, oldest first, for moderator review.
 *       Requires moderator or admin role.
 *     tags:
 *       - Stations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Paginated list of pending stations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Pending stations retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Station'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       403:
 *         description: Insufficient permissions (requires moderator+)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.get(
  '/pending',
  protect,
  checkPermission('stations:viewPending'),
  stationController.getPendingStations
);

/**
 * @swagger
 * /api/stations/{id}:
 *   get:
 *     summary: Get a single station by ID
 *     description: >
 *       Returns full station details, including populated submittedBy
 *       (displayName and avatar only), reviewCount, and averageRating.
 *       Soft-deleted stations return 404.
 *     tags:
 *       - Stations
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Station ObjectId
 *         example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *     responses:
 *       200:
 *         description: Station details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Station retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Station'
 *       404:
 *         description: Station not found or soft-deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *             example:
 *               success: false
 *               message: "Station not found"
 *               errors: []
 *               statusCode: 404
 */
router.get('/:id', stationController.getStationById);

/**
 * @swagger
 * /api/stations:
 *   post:
 *     summary: Submit a new charging station
 *     description: >
 *       Creates a new station. The authenticated user becomes the owner (submittedBy).
 *       The station defaults to `pending` status and requires moderator approval.
 *       Geocoding is performed automatically via the Nominatim OpenStreetMap API —
 *       supply either `addressString` (forward geocode) or explicit `lat`+`lng`
 *       coordinates (reverse geocode).
 *     tags:
 *       - Stations
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateStationBody'
 *           examples:
 *             forwardGeocode:
 *               summary: Using address string (forward geocoding)
 *               value:
 *                 name: "SolarCharge Hub - Colombo"
 *                 description: "Modern solar EV charging station near Galle Face Green"
 *                 addressString: "Galle Road, Colombo 3, Sri Lanka"
 *                 connectors:
 *                   - type: CCS
 *                     powerKw: 50
 *                     count: 2
 *                   - type: Type-2
 *                     powerKw: 22
 *                     count: 4
 *                 solarPanelKw: 100
 *                 amenities: ["wifi", "parking", "shade"]
 *                 operatingHours:
 *                   alwaysOpen: false
 *                   schedule:
 *                     - day: Mon
 *                       openTime: "08:00"
 *                       closeTime: "20:00"
 *             explicitCoords:
 *               summary: Using explicit coordinates (reverse geocoding)
 *               value:
 *                 name: "SolarCharge Hub - Kandy"
 *                 lat: 7.2906
 *                 lng: 80.6337
 *                 connectors:
 *                   - type: CHAdeMO
 *                     powerKw: 50
 *                     count: 1
 *                 solarPanelKw: 50
 *     responses:
 *       201:
 *         description: Station submitted successfully (status = pending)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Station submitted successfully and is pending review"
 *                 data:
 *                   $ref: '#/components/schemas/Station'
 *       400:
 *         description: Geocoding failed or invalid address
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.post(
  '/',
  protect,
  checkPermission('stations:create'),
  validate(createStationSchema),
  stationController.createStation
);

/**
 * @swagger
 * /api/stations/{id}:
 *   put:
 *     summary: Update a station
 *     description: >
 *       Updates an existing station. Station owners may update their own
 *       `pending` or `active` stations. Admins may update any station.
 *       Re-geocoding is triggered if `addressString` or `lat`/`lng` is supplied.
 *     tags:
 *       - Stations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Station ObjectId
 *         example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Partial station update — all fields optional but at least one required
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *               addressString:
 *                 type: string
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *               connectors:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Connector'
 *               solarPanelKw:
 *                 type: number
 *               amenities:
 *                 type: array
 *                 items:
 *                   type: string
 *               images:
 *                 type: array
 *                 maxItems: 5
 *                 items:
 *                   type: string
 *               operatingHours:
 *                 $ref: '#/components/schemas/OperatingHours'
 *     responses:
 *       200:
 *         description: Station updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Station updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Station'
 *       400:
 *         description: Bad request / geocoding failure
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       403:
 *         description: Not the owner or station is not editable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *             example:
 *               success: false
 *               message: "You can only edit your own stations"
 *               errors: []
 *               statusCode: 403
 *       404:
 *         description: Station not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.put(
  '/:id',
  protect,
  checkPermission('stations:update'),
  validate(updateStationSchema),
  stationController.updateStation
);

/**
 * @swagger
 * /api/stations/{id}/approve:
 *   patch:
 *     summary: Approve a pending station
 *     description: >
 *       Transitions a station from `pending` to `active`. Sets `isVerified: true`,
 *       `verifiedBy` to the moderator's user ID, and `verifiedAt` to the current
 *       timestamp. Requires moderator or admin role.
 *     tags:
 *       - Stations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Station ObjectId
 *         example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *     responses:
 *       200:
 *         description: Station approved and active
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Station approved and is now active"
 *                 data:
 *                   $ref: '#/components/schemas/Station'
 *       400:
 *         description: Station is not in pending status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *             example:
 *               success: false
 *               message: "Cannot approve a station with status \"active\". Only pending stations can be approved."
 *               errors: []
 *               statusCode: 400
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       403:
 *         description: Insufficient permissions (requires moderator+)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       404:
 *         description: Station not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.patch(
  '/:id/approve',
  protect,
  checkPermission('stations:approve'),
  stationController.approveStation
);

/**
 * @swagger
 * /api/stations/{id}/reject:
 *   patch:
 *     summary: Reject a pending station
 *     description: >
 *       Transitions a station from `pending` to `rejected` and stores the
 *       rejection reason. Attempts to notify the submitter via the shared email
 *       service (non-fatal if unavailable). Requires moderator or admin role.
 *     tags:
 *       - Stations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Station ObjectId
 *         example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RejectStationBody'
 *           example:
 *             rejectionReason: "Insufficient information about connector power levels and location accuracy."
 *     responses:
 *       200:
 *         description: Station rejected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Station rejected"
 *                 data:
 *                   $ref: '#/components/schemas/Station'
 *       400:
 *         description: Station is not in pending status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       403:
 *         description: Insufficient permissions (requires moderator+)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       404:
 *         description: Station not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       422:
 *         description: Validation error — rejectionReason missing or too short
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.patch(
  '/:id/reject',
  protect,
  checkPermission('stations:reject'),
  validate(rejectStationSchema),
  stationController.rejectStation
);

/**
 * @swagger
 * /api/stations/{id}:
 *   delete:
 *     summary: Soft-delete a station (Admin only)
 *     description: >
 *       Marks a station as inactive (`isActive: false`) and records
 *       `deletedAt` and `deletedBy`. The station is never permanently removed.
 *       Requires admin role.
 *     tags:
 *       - Stations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Station ObjectId
 *         example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *     responses:
 *       204:
 *         description: Station soft-deleted (no content)
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       403:
 *         description: Insufficient permissions (requires admin)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       404:
 *         description: Station not found or already deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.delete(
  '/:id',
  protect,
  checkPermission('stations:delete'),
  stationController.deleteStation
);

/**
 * @swagger
 * /api/stations/{id}/feature:
 *   patch:
 *     summary: Toggle featured status of a station
 *     description: >
 *       Flips the `isFeatured` flag on an active station. Featured stations
 *       appear at the top of the default listing and on the map's highlighted
 *       layer. Only active stations can be featured. Requires moderator or admin.
 *     tags:
 *       - Stations
 *     security:
 *       - bearerAuth: []
 *     x-permission: stations.feature
 *     x-roles: ["moderator", "admin"]
 *     x-min-role: 3
 *     x-component: stations
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Station ObjectId
 *         example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *     responses:
 *       200:
 *         description: Featured status toggled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Station has been featured"
 *                 data:
 *                   $ref: '#/components/schemas/Station'
 *       400:
 *         description: Station is not active
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Station not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.patch(
  '/:id/feature',
  protect,
  checkPermission('stations:feature'),
  stationController.featureStation
);

/**
 * @swagger
 * /api/stations/{id}/stats:
 *   get:
 *     summary: Get statistics for a station
 *     description: >
 *       Returns aggregated statistics for a station the authenticated user owns,
 *       including average rating, review count, featured/verified flags, and
 *       geocoding status. Moderators and admins can view stats for any station.
 *     tags:
 *       - Stations
 *     security:
 *       - bearerAuth: []
 *     x-permission: stations.view-stats-own
 *     x-roles: ["station_owner", "featured_contributor", "moderator", "admin"]
 *     x-min-role: 2
 *     x-component: stations
 *     x-owner-field: submittedBy
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Station ObjectId
 *         example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *     responses:
 *       200:
 *         description: Station statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Station statistics retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     stationId:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                     name:
 *                       type: string
 *                       example: "SolarCharge Hub - Colombo"
 *                     status:
 *                       type: string
 *                       enum: [pending, active, inactive, rejected]
 *                     averageRating:
 *                       type: number
 *                       example: 4.2
 *                     reviewCount:
 *                       type: number
 *                       example: 18
 *                     isFeatured:
 *                       type: boolean
 *                       example: false
 *                     isVerified:
 *                       type: boolean
 *                       example: true
 *                     geocodePending:
 *                       type: boolean
 *                       example: false
 *                     verifiedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Station not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.get(
  '/:id/stats',
  protect,
  checkPermission('stations:viewStats'),
  stationController.getStationStats
);

export default router;
