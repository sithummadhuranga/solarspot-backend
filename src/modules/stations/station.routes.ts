/**
 * Station routes — 11 endpoints.
 *
 * TODO: Member 1 — uncomment route registrations when controller/service are implemented.
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Stations
 *      MASTER_PROMPT.md → Route Middleware Order: protect → checkPermission → validate → controller
 */

import { Router } from 'express';
// import { protect }             from '@middleware/auth.middleware';
// import { checkPermission }     from '@middleware/rbac.middleware';
// import { validate }            from '@middleware/validate.middleware';
// import * as StationController  from './station.controller';
// import * as V                  from './station.validation';

const router = Router();

// ─── Public ──────────────────────────────────────────────────────────────────
// router.get('/',         StationController.listStations);
// router.get('/nearby',   StationController.getNearbyStations);
// router.get('/:id',      StationController.getStationById);
// router.get('/:id/weather',    StationController.getStationWeather);
// router.get('/:id/best-times', StationController.getStationBestTimes);

// ─── Authenticated ────────────────────────────────────────────────────────────
// router.post('/',         protect, validate(V.createStationSchema),  StationController.createStation);
// router.patch('/:id',     protect, validate(V.updateStationSchema),  StationController.updateStation);
// router.delete('/:id',    protect, StationController.deleteStation);

// ─── Admin (mount under /admin prefix in app.ts) ──────────────────────────────
// router.get('/admin/stations',              protect, checkPermission('stations.list'),    StationController.adminListStations);
// router.patch('/admin/stations/:id/approve', protect, checkPermission('stations.approve'), StationController.approveStation);
// router.patch('/admin/stations/:id/reject',  protect, checkPermission('stations.reject'),  StationController.rejectStation);

export default router;
