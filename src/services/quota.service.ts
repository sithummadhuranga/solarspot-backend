

import { QuotaUsage } from '@modules/permissions/quota_usage.model';
import logger from '@utils/logger';
import { ThirdPartyService } from '@/types';

export const QUOTA_LIMITS: Record<ThirdPartyService, number> = {
  brevo:          240,   // 80% of 300/day
  nominatim:      800,   // practical 800 calls/day
  openweathermap: 800,   // 80% of 1,000/day
  perspective:    800,   // 80% of QPS limit converted to daily
  cloudinary:     200,   // 80% of ~250 uploads/day on free tier
  huggingface:    800,   // 80% of ~1,000 req/day (free inference API)
};

const ALERT_THRESHOLD = 0.8;

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

export class MongoQuotaStore implements IQuotaStore {
  async get(service: ThirdPartyService, date: string): Promise<QuotaRecord | null> {
    const record = await QuotaUsage.findOne({ service, date }).lean();
    if (!record) return null;
    return { service: record.service as ThirdPartyService, date: record.date, count: record.count };
  }

  async increment(service: ThirdPartyService, date: string): Promise<number> {
    const result = await QuotaUsage.findOneAndUpdate(
      { service, date },
      { $inc: { count: 1 } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
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

export class QuotaService {
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
      logger.error(`QuotaService.check(${service}) error — allowing by default:`, err);
      return true;
    }
  }

  
  async increment(service: ThirdPartyService): Promise<void> {
    try {
      await this.store.increment(service, this.today());
    } catch (err) {
      logger.error(`QuotaService.increment(${service}) error:`, err);
    }
  }

  
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

  
  async reset(service: ThirdPartyService): Promise<void> {
    await this.store.reset(service, this.today());
    logger.info(`QuotaService.reset: cleared quota for ${service}`);
  }
}

export default QuotaService;
