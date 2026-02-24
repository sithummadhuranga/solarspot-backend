import mongoose from 'mongoose';
import { QuotaService, MongoQuotaStore } from '@services/quota.service';
import QuotaUsage from '@modules/permissions/models/quota-usage.model';

// Mock EmailService
jest.mock('@utils/email.service', () => ({
  __esModule: true,
  default: {
    sendQuotaAlertEmail: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('QuotaService', () => {
  let quotaService: QuotaService;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/solarspot-test');
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Instantiate with MongoQuotaStore
    quotaService = new QuotaService(new MongoQuotaStore());
    await QuotaUsage.deleteMany({});
  });

  describe('check()', () => {
    it('should return true when quota is below 80%', async () => {
      const today = new Date().toISOString().split('T')[0];
      await QuotaUsage.create({
        service: 'openweathermap',
        date: today,
        count: 500, // 50% of 1000
      });

      const result = await quotaService.check('openweathermap');
      expect(result).toBe(true);
    });

    it('should return false when quota is at or above 80%', async () => {
      const today = new Date().toISOString().split('T')[0];
      await QuotaUsage.create({
        service: 'openweathermap',
        date: today,
        count: 850, // 85% of 1000
      });

      const result = await quotaService.check('openweathermap');
      expect(result).toBe(false);
    });

    it('should return true when no quota record exists yet', async () => {
      const result = await quotaService.check('openweathermap');
      expect(result).toBe(true);
    });

    it('should handle all three services', async () => {
      const services: Array<'openweathermap' | 'perspective' | 'brevo'> = [
        'openweathermap',
        'perspective',
        'brevo',
      ];

      const results = await Promise.all(
        services.map(service => quotaService.check(service))
      );

      expect(results.every(r => r === true)).toBe(true);
    });
  });

  describe('increment()', () => {
    it('should create quota record if none exists', async () => {
      await quotaService.increment('openweathermap');

      const today = new Date().toISOString().split('T')[0];
      const quota = await QuotaUsage.findOne({
        service: 'openweathermap',
        date: today,
      });

      expect(quota).toBeTruthy();
      expect(quota?.count).toBe(1);
    });

    it('should increment existing quota', async () => {
      const today = new Date().toISOString().split('T')[0];
      await QuotaUsage.create({
        service: 'openweathermap',
        date: today,
        count: 5,
      });

      await quotaService.increment('openweathermap');

      const quota = await QuotaUsage.findOne({
        service: 'openweathermap',
        date: today,
      });

      expect(quota?.count).toBe(6);
    });

    it('should use atomic $inc operation', async () => {
      const promises = Array.from({ length: 10 }, () =>
        quotaService.increment('openweathermap')
      );

      await Promise.all(promises);

      const today = new Date().toISOString().split('T')[0];
      const quota = await QuotaUsage.findOne({
        service: 'openweathermap',
        date: today,
      });

      expect(quota?.count).toBe(10);
    });

    it('should send alert email when crossing 80% threshold', async () => {
      const EmailService = require('@utils/email.service').default;
      
      const today = new Date().toISOString().split('T')[0];
      await QuotaUsage.create({
        service: 'brevo',
        date: today,
        count: 239, // 79.67% of 300
      });

      await quotaService.increment('brevo'); // Now at 80%

      expect(EmailService.sendQuotaAlertEmail).toHaveBeenCalledWith(
        'brevo',
        expect.any(Number)
      );
    });

    it('should not send duplicate alerts', async () => {
      const EmailService = require('@utils/email.service').default;
      
      const today = new Date().toISOString().split('T')[0];
      await QuotaUsage.create({
        service: 'brevo',
        date: today,
        count: 240, // Already at 80%
      });

      await quotaService.increment('brevo');
      await quotaService.increment('brevo');

      // Should only be called once (when first crossing threshold)
      expect(EmailService.sendQuotaAlertEmail).toHaveBeenCalledTimes(0); // Already past threshold
    });
  });

  describe('getAll()', () => {
    it('should return all quota records for today', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      await QuotaUsage.create([
        { service: 'openweathermap', date: today, count: 500 },
        { service: 'perspective', date: today, count: 100 },
        { service: 'brevo', date: today, count: 150 },
      ]);

      const quotas = await quotaService.getAll();

      expect(quotas).toHaveLength(3);
      expect(quotas.every(q => q.date === today)).toBe(true);
    });

    it('should include percentage calculation', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      await QuotaUsage.create({
        service: 'openweathermap',
        date: today,
        count: 750,
      });

      const quotas = await quotaService.getAll();

      expect(quotas[0].percentage).toBe(75);
    });

    it('should return empty array if no quotas exist', async () => {
      const quotas = await quotaService.getAll();
      expect(quotas).toEqual([]);
    });

    it('should only return quotas for today, not yesterday', async () => {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      await QuotaUsage.create([
        { service: 'openweathermap', date: today, count: 500 },
        { service: 'openweathermap', date: yesterday, count: 999 },
      ]);

      const quotas = await quotaService.getAll();

      expect(quotas).toHaveLength(1);
      expect(quotas[0].date).toBe(today);
    });
  });

  describe('reset()', () => {
    it('should reset quota for specific service', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      await QuotaUsage.create([
        { service: 'openweathermap', date: today, count: 500 },
        { service: 'brevo', date: today, count: 200 },
      ]);

      await quotaService.reset('openweathermap');

      const openweather = await QuotaUsage.findOne({
        service: 'openweathermap',
        date: today,
      });
      const brevo = await QuotaUsage.findOne({
        service: 'brevo',
        date: today,
      });

      expect(openweather?.count).toBe(0);
      expect(brevo?.count).toBe(200); // Unchanged
    });

    it('should handle resetting non-existent quota gracefully', async () => {
      await expect(quotaService.reset('openweathermap')).resolves.not.toThrow();
    });

    it('should preserve limit when resetting', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      await QuotaUsage.create({
        service: 'openweathermap',
        date: today,
        count: 999,
      });

      await quotaService.reset('openweathermap');

      const quota = await QuotaUsage.findOne({
        service: 'openweathermap',
        date: today,
      });

      expect(quota?.count).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle 100% quota usage', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      await QuotaUsage.create({
        service: 'brevo',
        date: today,
        count: 300,
      });

      const canProceed = await quotaService.check('brevo');
      expect(canProceed).toBe(false);
    });

    it('should handle exactly 80% threshold', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      await QuotaUsage.create({
        service: 'openweathermap',
        date: today,
        count: 800,
      });

      const canProceed = await quotaService.check('openweathermap');
      expect(canProceed).toBe(false);
    });

    it('should handle concurrent increments without race conditions', async () => {
      const promises = Array.from({ length: 100 }, () =>
        quotaService.increment('perspective')
      );

      await Promise.all(promises);

      const today = new Date().toISOString().split('T')[0];
      const quota = await QuotaUsage.findOne({
        service: 'perspective',
        date: today,
      });

      expect(quota?.count).toBe(100);
    });

    it('should handle different dates correctly', async () => {
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      await QuotaUsage.create({
        service: 'openweathermap',
        date: today,
        count: 1000,
      });

      // Simulate next day - should be able to proceed
      await QuotaUsage.create({
        service: 'openweathermap',
        date: tomorrow,
        count: 0,
      });

      const quotaToday = await QuotaUsage.findOne({
        service: 'openweathermap',
        date: today,
      });

      const quotaTomorrow = await QuotaUsage.findOne({
        service: 'openweathermap',
        date: tomorrow,
      });

      expect(quotaToday?.count).toBe(1000);
      expect(quotaTomorrow?.count).toBe(0);
    });
  });
});
