/**
 * Dependency Injection container — wires all concrete implementations at startup.
 *
 * Owner: Member 4 — complete the wiring when services are implemented.
 * Ref:  MASTER_PROMPT.md → SOLID → Dependency Inversion Principle
 *       "Bootstrap: wire the concrete implementation at startup"
 *
 * Rule: High-level services (StationService, ReviewService, etc.) depend on
 * ABSTRACTIONS (interfaces). The concrete classes are instantiated HERE only.
 * Never instantiate services inside other services.
 *
 * Usage:
 *   import { container } from '@/container';
 *   container.emailService.sendWelcome(user);
 *   container.quotaService.check('openweathermap');
 *   container.permissionEngine.evaluate(user, 'stations.create');
 */

import EmailService  from '@services/email.service';
import QuotaService, { MongoQuotaStore }  from '@services/quota.service';
import PermissionEngine from '@services/permission.engine';
import { NominatimGeocoder } from '@utils/geocoder';

// ─── Interface declarations (DIP: depend on these, not on concrete classes) ──
export type IEmailService = InstanceType<typeof EmailService>;
export type IQuotaService = InstanceType<typeof QuotaService>;
export type IPermissionEngine = InstanceType<typeof PermissionEngine>;

// ─── Container ───────────────────────────────────────────────────────────────
interface Container {
  emailService: IEmailService;
  quotaService: IQuotaService;
  permissionEngine: IPermissionEngine;
  geocoder: InstanceType<typeof NominatimGeocoder>;
}

function buildContainer(): Container {
  const emailService     = new EmailService();
  const quotaService     = new QuotaService(
    new MongoQuotaStore(),
    emailService,
    process.env.ADMIN_EMAIL,
  );
  const permissionEngine = new PermissionEngine();
  const geocoder         = new NominatimGeocoder();

  return { emailService, quotaService, permissionEngine, geocoder };
}

// Singleton — import `container` everywhere, never call buildContainer() again
export const container = buildContainer();
