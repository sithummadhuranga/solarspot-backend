import QuotaUsage, { ThirdPartyService } from '@modules/permissions/models/quota-usage.model';
import logger from '@utils/logger';
import emailService from '@utils/email.service';

// ─── Quota Limits Configuration ─────────────────────────────────────────────
const QUOTA_LIMITS: Record<ThirdPartyService, number> = {
  openweathermap: 1000, // OpenWeatherMap free tier: 1,000 calls/day
  perspective: 1000, // Google Perspective API: tracking daily calls
  brevo: 300, // Brevo SMTP free tier: 300 emails/day
};

// Alert threshold: 80% of limit
const ALERT_THRESHOLD = 0.8;

// ─── Dependency Inversion: Quota Store Interface ────────────────────────────
// This allows swapping to an in-memory store during tests without touching service code
export interface IQuotaStore {
  get(service: string, date: string): Promise<{ count: number } | null>;
  increment(service: string, date: string): Promise<{ count: number }>;
  reset(service: string, date: string): Promise<void>;
}

// ─── Concrete Implementation: MongoDB Quota Store ───────────────────────────
class MongoQuotaStore implements IQuotaStore {
  async get(service: string, date: string): Promise<{ count: number } | null> {
    const record = await QuotaUsage.findOne({ service, date }).lean();
    return record ? { count: record.count } : null;
  }

  async increment(service: string, date: string): Promise<{ count: number }> {
    const result = await QuotaUsage.findOneAndUpdate(
      { service, date },
      { $inc: { count: 1 } },
      { upsert: true, new: true }
    );
    return { count: result.count };
  }

  async reset(service: string, date: string): Promise<void> {
    await QuotaUsage.findOneAndUpdate(
      { service, date },
      { $set: { count: 0 } },
      { upsert: true }
    );
  }
}

// ─── QuotaService Class (Single Responsibility: track third-party API usage) ─
class QuotaService {
  private store: IQuotaStore;

  constructor(store: IQuotaStore) {
    this.store = store;
  }
  /**
   * Check if a service is within its quota for today.
   * Returns true if the service can be called, false if quota exceeded.
   */
  async check(service: ThirdPartyService): Promise<boolean> {
    const today = this.getTodayString();
    const usage = await this.getUsage(service, today);
    const limit = QUOTA_LIMITS[service];

    if (usage >= limit) {
      logger.warn(`Quota exceeded for ${service}`, { usage, limit, date: today });
      return false;
    }

    return true;
  }

  /**
   * Increment the usage counter for a service.
   * Atomically increments (upserts if doesn't exist).
   * Sends alert email if 80% threshold crossed.
   */
  async increment(service: ThirdPartyService): Promise<void> {
    const today = this.getTodayString();
    const limit = QUOTA_LIMITS[service];

    // Atomic increment with upsert
    const result = await this.store.increment(service, today);
    const newCount = result.count;
    const percentage = (newCount / limit) * 100;

    logger.debug(`Quota incremented for ${service}`, {
      date: today,
      count: newCount,
      limit,
      percentage: percentage.toFixed(2),
    });

    // Send alert if threshold crossed exactly (not on every call after)
    if (newCount === Math.ceil(limit * ALERT_THRESHOLD)) {
      await this.sendAlertEmail(service, percentage, newCount, limit);
    }
  }

  /**
   * Get current usage count for a service on a specific date.
   */
  async getUsage(service: ThirdPartyService, date: string): Promise<number> {
    const record = await this.store.get(service, date);
    return record?.count ?? 0;
  }

  /**
   * Get quota summary for all services (for admin dashboard).
   */
  async getAll(): Promise<
    Array<{
      service: ThirdPartyService;
      count: number;
      limit: number;
      percentage: number;
      date: string;
    }>
  > {
    const today = this.getTodayString();
    const services: ThirdPartyService[] = ['openweathermap', 'perspective', 'brevo'];

    const results = await Promise.all(
      services.map(async (service) => {
        const count = await this.getUsage(service, today);
        const limit = QUOTA_LIMITS[service];
        const percentage = (count / limit) * 100;

        return {
          service,
          count,
          limit,
          percentage: parseFloat(percentage.toFixed(2)),
          date: today,
        };
      })
    );

    return results;
  }

  /**
   * Reset quota for a service (admin only, for testing).
   */
  async reset(service: ThirdPartyService, date?: string): Promise<void> {
    const targetDate = date ?? this.getTodayString();
    await this.store.reset(service, targetDate);
    logger.info(`Quota reset for ${service}`, { date: targetDate });
  }

  /**
   * Send alert email to admins when quota threshold is crossed.
   */
  private async sendAlertEmail(
    service: ThirdPartyService,
    percentage: number,
    count: number,
    limit: number
  ): Promise<void> {
    try {
      await emailService.sendQuotaAlertEmail(service, percentage, count, limit);
      logger.info(`Quota alert email sent for ${service}`, { percentage, count, limit });
    } catch (err) {
      logger.error('Failed to send quota alert email', {
        service,
        percentage,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Get today's date as YYYY-MM-DD string (UTC).
   */
  private getTodayString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────
// Instantiate the quota service with MongoDB store
const quotaService = new QuotaService(new MongoQuotaStore());

export default quotaService;
export { QuotaService, MongoQuotaStore };
