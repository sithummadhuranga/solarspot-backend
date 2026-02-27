import { Router } from 'express';
import { protect }         from '@middleware/auth.middleware';
import { checkPermission } from '@middleware/rbac.middleware';
import { validate }        from '@middleware/validate.middleware';
import * as StationController from './station.controller';
import * as V from './station.validation';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Stations
 *   description: Solar charging station management
 */

/**
 * @swagger
 * /api/stations:
 *   get:
 *     summary: List all active stations (paginated, filterable)
 *     tags: [Stations]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Full-text search
 *       - in: query
 *         name: lat
 *         schema: { type: number }
 *       - in: query
 *         name: lng
 *         schema: { type: number }
 *       - in: query
 *         name: radius
 *         schema: { type: number, default: 25 }
 *         description: Radius in km (requires lat & lng)
 *       - in: query
 *         name: connectorType
 *         schema:
 *           type: string
 *           enum: [USB-C, Type-2, CCS, CHAdeMO, Tesla-NACS, AC-Socket]
 *       - in: query
 *         name: minRating
 *         schema: { type: number, minimum: 0, maximum: 5 }
 *       - in: query
 *         name: isVerified
 *         schema: { type: boolean }
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [newest, rating, distance, featured]
 *           default: newest
 *     responses:
 *       200:
 *         description: Paginated list of stations
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get('/',        validate(V.listStationsQuerySchema, 'query'), StationController.listStations);

/**
 * @swagger
 * /api/stations/nearby:
 *   get:
 *     summary: Find stations near a coordinate (sorted by distance)
 *     tags: [Stations]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema: { type: number }
 *       - in: query
 *         name: lng
 *         required: true
 *         schema: { type: number }
 *       - in: query
 *         name: radius
 *         schema: { type: number, default: 10 }
 *         description: Radius in km
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Array of nearby stations with distanceKm field
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get('/nearby',  validate(V.nearbyQuerySchema, 'query'),       StationController.getNearbyStations);

/**
 * @swagger
 * /api/stations/search:
 *   get:
 *     summary: Full-text search across station names / descriptions
 *     tags: [Stations]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: Search query
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [newest, rating, featured]
 *           default: newest
 *     responses:
 *       200:
 *         description: Paginated search results
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get('/search',  validate(V.searchQuerySchema, 'query'),       StationController.searchStations);

/**
 * @swagger
 * /api/stations/pending:
 *   get:
 *     summary: List stations awaiting moderation (Moderator+)
 *     tags: [Stations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Paginated list of pending stations
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — insufficient role
 */
router.get('/pending',
  protect,
  checkPermission('stations.read-pending'),
  StationController.getPendingStations
);

/**
 * @swagger
 * /api/stations/{id}:
 *   get:
 *     summary: Get a single station by ID
 *     tags: [Stations]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Station ObjectId
 *     responses:
 *       200:
 *         description: Station document
 *       404:
 *         description: Station not found
 */
router.get('/:id', StationController.getStationById);

/**
 * @swagger
 * /api/stations:
 *   post:
 *     summary: Create a new station (authenticated users)
 *     tags: [Stations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, connectors, solarPanelKw]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Solar Hub Colombo
 *               description:
 *                 type: string
 *               addressString:
 *                 type: string
 *                 example: Galle Rd, Colombo 03
 *               lat:
 *                 type: number
 *                 example: 6.9271
 *               lng:
 *                 type: number
 *                 example: 79.8612
 *               connectors:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [USB-C, Type-2, CCS, CHAdeMO, Tesla-NACS, AC-Socket]
 *                     powerKw:
 *                       type: number
 *                     count:
 *                       type: integer
 *               solarPanelKw:
 *                 type: number
 *                 example: 10
 *               amenities:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [wifi, cafe, restroom, parking, security, shade, water, repair_shop, ev_parking]
 *               images:
 *                 type: array
 *                 items: { type: string, format: uri }
 *     responses:
 *       201:
 *         description: Station created — status is pending until moderated
 *       401:
 *         description: Unauthorized
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/',
  protect,
  validate(V.createStationSchema),
  StationController.createStation
);

/**
 * @swagger
 * /api/stations/{id}:
 *   put:
 *     summary: Update a station (owner only)
 *     tags: [Stations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               addressString: { type: string }
 *               lat: { type: number }
 *               lng: { type: number }
 *               solarPanelKw: { type: number }
 *     responses:
 *       200:
 *         description: Updated station document
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not the station owner
 *       404:
 *         description: Station not found
 */
router.put('/:id',
  protect,
  checkPermission('stations.edit-own'),
  validate(V.updateStationSchema),
  StationController.updateStation
);

/**
 * @swagger
 * /api/stations/{id}:
 *   delete:
 *     summary: Soft-delete a station (Admin)
 *     tags: [Stations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Station deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Station not found
 */
router.delete('/:id',
  protect,
  checkPermission('stations.delete-any'),
  StationController.deleteStation
);

/**
 * @swagger
 * /api/stations/{id}/approve:
 *   patch:
 *     summary: Approve a pending station (Moderator+)
 *     tags: [Stations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Station approved and set to active
 *       400:
 *         description: Station is not in pending status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — insufficient role
 *       404:
 *         description: Station not found
 */
router.patch('/:id/approve',
  protect,
  checkPermission('stations.approve'),
  StationController.approveStation
);

/**
 * @swagger
 * /api/stations/{id}/reject:
 *   patch:
 *     summary: Reject a pending station with a reason (Moderator+)
 *     tags: [Stations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rejectionReason]
 *             properties:
 *               rejectionReason:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 500
 *                 example: Insufficient solar panel information provided
 *     responses:
 *       200:
 *         description: Station rejected
 *       400:
 *         description: Station is not in pending status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — insufficient role
 *       404:
 *         description: Station not found
 */
router.patch('/:id/reject',
  protect,
  checkPermission('stations.reject'),
  validate(V.rejectStationSchema),
  StationController.rejectStation
);

/**
 * @swagger
 * /api/stations/{id}/feature:
 *   patch:
 *     summary: Toggle featured status of an active station (Moderator+)
 *     tags: [Stations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: isFeatured toggled
 *       400:
 *         description: Station is not active
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — insufficient role
 *       404:
 *         description: Station not found
 */
router.patch('/:id/feature',
  protect,
  checkPermission('stations.feature'),
  StationController.featureStation
);

/**
 * @swagger
 * /api/stations/{id}/stats:
 *   get:
 *     summary: Get stats for a station (rating, reviewCount, featured, verified)
 *     tags: [Stations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Station stats object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Station not found
 */
router.get('/:id/stats',
  protect,
  checkPermission('stations.read'),
  StationController.getStationStats
);

export default router;
