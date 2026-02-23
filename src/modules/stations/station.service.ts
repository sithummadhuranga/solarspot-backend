/**
 * Station service — business logic layer.
 *
 * TODO: Member 1 — implement all methods. Use mongoose sessions for multi-doc writes.
 *
 * Ref: PROJECT_OVERVIEW.md → API Endpoints → Stations (11 endpoints)
 *      MASTER_PROMPT.md → ACID — geospatial, owner checks, discriminator usage
 */

import type {
  IStation,
  CreateStationInput,
  NearbyStationsQuery,
  ListStationsQuery,
  PaginationResult,
} from '@/types';
import logger from '@utils/logger';

class StationService {
  /** POST /stations — create station (any authenticated user, default status: pending_review) */
  async createStation(_ownerId: string, _input: CreateStationInput): Promise<IStation> {
    logger.warn('StationService.createStation: not yet implemented'); throw new Error('Not implemented');
  }

  /** GET /stations — public list with filters (status, type, city) + pagination */
  async listStations(_query: ListStationsQuery): Promise<PaginationResult<IStation>> {
    logger.warn('StationService.listStations: not yet implemented'); throw new Error('Not implemented');
  }

  /** GET /stations/nearby — geospatial $near query, requires 2dsphere index */
  async getNearbyStations(_query: NearbyStationsQuery): Promise<IStation[]> {
    logger.warn('StationService.getNearbyStations: not yet implemented'); throw new Error('Not implemented');
  }

  /** GET /stations/:id — get station by id (public) */
  async getStationById(_id: string): Promise<IStation> {
    logger.warn('StationService.getStationById: not yet implemented'); throw new Error('Not implemented');
  }

  /** PATCH /stations/:id — owner or admin can update; check ownership or permission */
  async updateStation(_id: string, _requesterId: string, _input: Partial<CreateStationInput>): Promise<IStation> {
    logger.warn('StationService.updateStation: not yet implemented'); throw new Error('Not implemented');
  }

  /** DELETE /stations/:id — soft-delete (set isDeleted:true, deletedAt:now) */
  async deleteStation(_id: string, _requesterId: string): Promise<void> {
    logger.warn('StationService.deleteStation: not yet implemented'); throw new Error('Not implemented');
  }

  /** PATCH /admin/stations/:id/approve — admin approves station (status → active) */
  async approveStation(_id: string): Promise<IStation> {
    logger.warn('StationService.approveStation: not yet implemented'); throw new Error('Not implemented');
  }

  /** PATCH /admin/stations/:id/reject — admin rejects station (status → inactive) */
  async rejectStation(_id: string, _reason: string): Promise<IStation> {
    logger.warn('StationService.rejectStation: not yet implemented'); throw new Error('Not implemented');
  }

  /** GET /admin/stations — admin list all stations including pending_review */
  async adminListStations(_query: ListStationsQuery): Promise<PaginationResult<IStation>> {
    logger.warn('StationService.adminListStations: not yet implemented'); throw new Error('Not implemented');
  }

  /** GET /stations/:id/weather — forwarded to WeatherService (Member 3) */
  async getStationWeather(_stationId: string): Promise<unknown> {
    logger.warn('StationService.getStationWeather: not yet implemented — delegates to WeatherService (Member 3)');
    throw new Error('Not implemented');
  }

  /** GET /stations/:id/best-times — forwarded to WeatherService (Member 3) */
  async getStationBestTimes(_stationId: string): Promise<unknown> {
    logger.warn('StationService.getStationBestTimes: not yet implemented — delegates to WeatherService (Member 3)');
    throw new Error('Not implemented');
  }
}

export default new StationService();
