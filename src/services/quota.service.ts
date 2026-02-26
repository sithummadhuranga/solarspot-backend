/**
 * QuotaService — single responsibility: track and gate third-party API usage.
 *
 * Owner: Member 4
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
 *     return getCachedWeather(stationId) ?? null;
 *   }
 *   const data = await axios.get(...);
 *   await quotaService.increment('openweathermap');
 */

import { QuotaUsage } from '@modules/permissions/quota_usage.model';
import logger from '@utils/logger';
import { ThirdPartyService } from '@/types';

// ─── Daily limits per service ────────────────────────────────────────────────
// 80% of the published free limit. When exceeded, check() returns false.
export const QUOTA_LIMITS: Record<ThirdPartyService, number> = {
  brevo:          240,   // 80% of 300/day
  nominatim:      800,   // practical 800 calls/day
  openweathermap: 800,   // 80% of 1,000/day
  perspective:    800,   // 80% of QPS limit converted to daily
  cloudinary:     200,   // 80% of ~250 uploads/day on free tier
};

// Alert threshold — email admin at this percentage (80% of soft limit)
const ALERT_THRESHOLD = 0.8;

// ─── Quota store abstraction (DIP) ──────────────────────────────────────────
export interface IQuotaStore {
  get(service: ThirdPartyService, date: string): Promise<QuotaRecord | null>;
  increment(service: ThirdPartyService, date: string): Promise<number>;
  reset(service: ThirdPartyService, date: string): Promise<void>;
}

export interface QuotaRecord {
  service: ThirdPartyService;
  date: string;
  count: number;
}

// ─── MongoDB-backed store (production) ──────────────────────────────────────
export class MongoQuotaStore implements IQuotaStore {
  async get(service: ThirdPartyService, date: string): Promise<QuotaRecord | null> {
    const record = await QuotaUsage.findOne({ service, date }).lean();
    if (!record) return null;
    return { service: record.service as ThirdPartyService, date: record.date, count: record.count };
  }

  async increment(service: ThirdPartyService, date: string): Promise<number> {
    // Atomic $inc + upsert — safe under concurrent requests (Isolation rule)
    const result = await QuotaUsage.findOneAndUpdate(
      { service, date },
      { $inc: { count: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return result.count;
  }

  async reset(service: ThirdPartyService, date: string): Promise<void> {
    await QuotaUsage.findOneAndUpdate(
      { service, date },
      { $set: { count: 0 } },
      { upsert: true },
    );
  }
}

// ─── QuotaService ────────────────────────────────────────────────────────────
export class QuotaService {
  // Track which services have had alerts sent today to avoid repeat emails
  private alertsSent = new Set<string>();

  constructor(
    private readonly store: IQuotaStore,
    private readonly emailService?: {
      sendQuotaAlert(email: string, svc: string, pct: number, count: number): Promise<void>;
    },
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
    try {
      const date = this.today();
      const record = await this.store.get(service, date);
      const count = record?.count ?? 0;
      const limit = QUOTA_LIMITS[service];

      if (count >= limit) {
        logger.warn(`QuotaService: ${service} daily limit reached (${count}/${limit}). Blocking call.`);
        return false;
      }

      // Send admin alert at 80% of soft limit — only once per service per day
      const alertKey = `${service}:${date}`;
      const alertAt = Math.floor(limit * ALERT_THRESHOLD);
      if (count >= alertAt && !this.alertsSent.has(alertKey)) {
        this.alertsSent.add(alertKey);
        const percentage = Math.round((count / limit) * 100);
        logger.warn(`QuotaService: ${service} at ${percentage}% of daily quota.`);

        if (this.emailService && this.adminEmail) {
          this.emailService
            .sendQuotaAlert(this.adminEmail, service, percentage, count)
            .catch(err => logger.error('QuotaService: failed to send quota alert email', err));
        }
      }

      return true;
    } catch (err) {
      // Never block the caller if quota check fails — log and allow
      logger.error(`QuotaService.check(${service}) error — allowing by default:`, err);
      return true;
    }
  }

  /**
   * Increments the counter for a service.
   * Call this AFTER a successful third-party API call.
   * Uses atomic $inc upsert — safe under concurrent requests (Isolation rule).
   */
  async increment(service: ThirdPartyService): Promise<void> {
    try {
      await this.store.increment(service, this.today());
    } catch (err) {
      logger.error(`QuotaService.increment(${service}) error:`, err);
    }
  }

  /**
   * Returns today's usage stats for all services.
   * Exposed via GET /api/admin/quotas (permission: quotas.read)
   */
  async getStats(): Promise<Array<{ service: string; count: number; limit: number; percentage: number }>> {
    const date = this.today();
    const services = Object.keys(QUOTA_LIMITS) as ThirdPartyService[];

    const records = await Promise.all(
      services.map(async service => {
        const record = await this.store.get(service, date).catch(() => null);
        const count = record?.count ?? 0;
        const limit = QUOTA_LIMITS[service];
        return {
          service,
          count,
          limit,
          percentage: Math.round((count / limit) * 100),
        };
      }),
    );

    return records;
  }

  /** Manual reset — admin use only. */
  async reset(service: ThirdPartyService): Promise<void> {
    await this.store.reset(service, this.today());
    logger.info(`QuotaService.reset: cleared quota for ${service}`);
  }
}

export default QuotaService;
