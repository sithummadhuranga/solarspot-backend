import { Router } from 'express';
import { protect }         from '@middleware/auth.middleware';
import { checkPermission } from '@middleware/rbac.middleware';
import { validate }        from '@middleware/validate.middleware';
import * as StationController from './station.controller';
import * as V from './station.validation';

const router = Router();

// ─── Public ────────────────────────────────────────────────────────────────────
// NOTE: specific paths (/nearby, /search, /pending) MUST come before /:id
router.get('/',        validate(V.listStationsQuerySchema, 'query'), StationController.listStations);
router.get('/nearby',  validate(V.nearbyQuerySchema, 'query'),       StationController.getNearbyStations);
router.get('/search',  validate(V.searchQuerySchema, 'query'),       StationController.searchStations);

// ─── Moderator / Admin ─────────────────────────────────────────────────────────
router.get('/pending',
  protect,
  checkPermission('stations:viewPending'),
  StationController.getPendingStations
);

// ─── Public (by ID) ───────────────────────────────────────────────────────────
router.get('/:id', StationController.getStationById);

// ─── Authenticated ────────────────────────────────────────────────────────────
router.post('/',
  protect,
  validate(V.createStationSchema),
  StationController.createStation
);

router.put('/:id',
  protect,
  validate(V.updateStationSchema),
  StationController.updateStation
);

router.delete('/:id',
  protect,
  StationController.deleteStation
);

// ─── Moderation ───────────────────────────────────────────────────────────────
router.patch('/:id/approve',
  protect,
  checkPermission('stations:approve'),
  StationController.approveStation
);

router.patch('/:id/reject',
  protect,
  checkPermission('stations:reject'),
  validate(V.rejectStationSchema),
  StationController.rejectStation
);

router.patch('/:id/feature',
  protect,
  checkPermission('stations:feature'),
  StationController.featureStation
);

// ─── Stats ────────────────────────────────────────────────────────────────────
router.get('/:id/stats',
  protect,
  StationController.getStationStats
);

export default router;
