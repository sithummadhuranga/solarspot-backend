

import EmailService  from '@services/email.service';
import QuotaService, { MongoQuotaStore }  from '@services/quota.service';
import PermissionEngine from '@services/permission.engine';
import { NominatimGeocoder } from '@utils/geocoder';

export type IEmailService = InstanceType<typeof EmailService>;
export type IQuotaService = InstanceType<typeof QuotaService>;
export type IPermissionEngine = InstanceType<typeof PermissionEngine>;

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

export const container = buildContainer();
