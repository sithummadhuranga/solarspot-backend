/**
 * QuotaService — single responsibility: track and gate third-party API usage.
 *
 * Owner: Member 4 — implement check(), increment(), getStats(), reset().
 * Ref:  PROJECT_OVERVIEW.md → Third-Party APIs — All Free, All Quota-Tracked
 *       MASTER_PROMPT.md → Security → Third-Party API Calls
 *
 * DI contract: depends on IQuotaStore, not MongoDB directly.
 * Allows in-memory store during tests — no Atlas connection needed.
 * Wired in src/container.ts at startup.
 *
 * Usage pattern (every external API call must follow this):
 *
 *   const canCall = await quotaService.check('openweathermap');
 *   if (!canCall) {
 *     // degrade gracefully — return cached data or null
 *     return getCachedWeather(stationId) ?? null;
 *   }
 *   const data = await axios.get(...);
 *   await quotaService.increment('openweathermap');
 */

import logger from '@utils/logger';
import { ThirdPartyService } from '@/types';

// ─── Daily limits per service ────────────────────────────────────────────────
// 80% of the published free limit. When exceeded, QuotaService.check() returns false.
export const QUOTA_LIMITS: Record<ThirdPartyService, number> = {
  brevo:          240,  // 80% of 300/day
  nominatim:      800,  // no published limit — practical 800 calls/day
  openweathermap: 800,  // 80% of 1,000/day
  perspective:    800,  // 80% of QPS limit converted to daily
  cloudinary:     200,  // 80% of ~250 uploads/day on free tier
};

// ─── Quota store abstraction (DIP) ──────────────────────────────────────────
export interface IQuotaStore {
  get(service: ThirdPartyService, date: string): Promise<QuotaRecord | null>;
  increment(service: ThirdPartyService, date: string): Promise<number>;
  reset(service: ThirdPartyService, date: string): Promise<void>;
}

export interface QuotaRecord {
  service: ThirdPartyService;
  date: string;          // YYYY-MM-DD
  count: number;
}

// ─── QuotaService ────────────────────────────────────────────────────────────
export class QuotaService {
  constructor(
    private readonly store: IQuotaStore,
    private readonly emailService?: { sendQuotaAlert: (email: string, svc: string, pct: number, count: number) => Promise<void> },
    private readonly adminEmail?: string,
  ) {}

  private today(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Returns true if the service is within its daily quota.
   * Call this BEFORE every third-party API request.
   */
  async check(service: ThirdPartyService): Promise<boolean> {
    // TODO: Member 4 — implement
    // 1. Get today's count from store
    // 2. If count >= QUOTA_LIMITS[service] → log warning, return false
    // 3. If count >= 0.8 * QUOTA_LIMITS[service] → send admin alert email
    // 4. Return true
    logger.warn(`QuotaService.check(${service}): not yet implemented — allowing by default`);
    return true;
  }

  /**
   * Increments the counter for a service.
   * Call this AFTER a successful third-party API call.
   * Uses atomic $inc upsert — safe under concurrent requests (Isolation rule).
   */
  async increment(service: ThirdPartyService): Promise<void> {
    // TODO: Member 4 — implement
    logger.warn(`QuotaService.increment(${service}): not yet implemented`);
  }

  /**
   * Returns today's usage stats for all services.
   * Exposed via GET /api/admin/quotas (permission: quotas.read)
   */
  async getStats(): Promise<Record<ThirdPartyService, QuotaRecord | null>> {
    // TODO: Member 4 — implement
    logger.warn('QuotaService.getStats: not yet implemented');
    return {} as Record<ThirdPartyService, QuotaRecord | null>;
  }

  /** Manual reset — admin use only. */
  async reset(service: ThirdPartyService): Promise<void> {
    // TODO: Member 4 — implement
    logger.warn(`QuotaService.reset(${service}): not yet implemented`);
  }
}

export default QuotaService;
