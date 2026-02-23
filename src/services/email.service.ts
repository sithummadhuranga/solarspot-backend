/**
 * EmailService — single responsibility: send HTML emails via Brevo (SMTP).
 *
 * Owner: Member 4 — implement all methods.
 * Ref:  PROJECT_OVERVIEW.md → Email Templates (7 templates)
 *       MASTER_PROMPT.md → SOLID → Single Responsibility
 *       MASTER_PROMPT.md → SOLID → Open/Closed (add template = add method + file, never touch send())
 *
 * DI contract: depends on IMailTransport, not Nodemailer directly.
 * Wired in src/container.ts at startup.
 *
 * Template variables convention: {{VARIABLE_NAME}} replaced by send() helper.
 * All templates live in src/templates/*.html
 */

import path from 'path';
import fs from 'fs';
import nodemailer, { Transporter } from 'nodemailer';
import { config } from '@config/env';
import logger from '@utils/logger';
import { IUserForEmail } from '@/types';

// ─── Mail transport abstraction (DIP) ───────────────────────────────────────
export interface IMailTransport {
  sendMail(options: nodemailer.SendMailOptions): Promise<void>;
}

class NodemailerTransport implements IMailTransport {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.EMAIL_HOST,
      port: config.EMAIL_PORT,
      secure: config.EMAIL_SECURE,
      auth: { user: config.EMAIL_USER, pass: config.EMAIL_PASS },
    });
  }

  async sendMail(options: nodemailer.SendMailOptions): Promise<void> {
    await this.transporter.sendMail(options);
  }
}

// In dev/test: logs email HTML to console instead of sending (EMAIL_PREVIEW=true)
class PreviewTransport implements IMailTransport {
  async sendMail(options: nodemailer.SendMailOptions): Promise<void> {
    logger.info(`[EmailPreview] To: ${options.to} | Subject: ${options.subject}`);
    logger.debug(`[EmailPreview] Body: ${String(options.html).substring(0, 200)}...`);
  }
}

// ─── EmailService ────────────────────────────────────────────────────────────
export class EmailService {
  private transport: IMailTransport;
  private readonly templatesDir = path.join(__dirname, '../templates');

  constructor(transport?: IMailTransport) {
    this.transport = transport ?? (config.EMAIL_PREVIEW
      ? new PreviewTransport()
      : new NodemailerTransport());
  }

  // ─── Core send helper — NEVER call directly from outside this class ────────
  private async send(
    to: string,
    subject: string,
    templateName: string,
    vars: Record<string, string>,
  ): Promise<void> {
    try {
      const templatePath = path.join(this.templatesDir, `${templateName}.html`);
      let html = fs.readFileSync(templatePath, 'utf-8');

      // Replace all {{VARIABLE}} placeholders — OCP: never modify this line
      const allVars = {
        APP_NAME: config.APP_NAME,
        APP_URL: config.APP_URL,
        YEAR: String(new Date().getFullYear()),
        ...vars,
      };
      for (const [key, value] of Object.entries(allVars)) {
        html = html.replaceAll(`{{${key}}}`, value);
      }

      await this.transport.sendMail({
        from: `"${config.EMAIL_FROM_NAME}" <${config.EMAIL_FROM_ADDRESS}>`,
        to,
        subject,
        html,
      });
    } catch (err) {
      // Email failure must never crash the app — log and continue
      logger.error(`EmailService.send failed for template "${templateName}":`, err);
    }
  }

  // ─── Template methods ────────────────────────────────────────────────────
  // OCP: add a new template = add one method here + one HTML file in /templates

  /** Triggered: POST /api/auth/register */
  async sendVerifyEmail(user: IUserForEmail, verifyUrl: string): Promise<void> {
    // TODO: Member 4 — implement
    logger.warn('EmailService.sendVerifyEmail: not yet implemented');
  }

  /** Triggered: POST /api/auth/forgot-password */
  async sendPasswordReset(user: IUserForEmail, resetUrl: string): Promise<void> {
    // TODO: Member 4 — implement
    logger.warn('EmailService.sendPasswordReset: not yet implemented');
  }

  /** Triggered: GET /api/auth/verify-email/:token (after successful verification) */
  async sendWelcome(user: IUserForEmail): Promise<void> {
    // TODO: Member 4 — implement
    logger.warn('EmailService.sendWelcome: not yet implemented');
  }

  /** Triggered: PATCH /api/stations/:id/approve */
  async sendStationApproved(user: IUserForEmail, stationName: string, stationUrl: string): Promise<void> {
    // TODO: Member 4 — implement
    logger.warn('EmailService.sendStationApproved: not yet implemented');
  }

  /** Triggered: PATCH /api/stations/:id/reject */
  async sendStationRejected(user: IUserForEmail, stationName: string, reason: string): Promise<void> {
    // TODO: Member 4 — implement
    logger.warn('EmailService.sendStationRejected: not yet implemented');
  }

  /** Triggered: QuotaService when 80% threshold is hit */
  async sendQuotaAlert(adminEmail: string, serviceName: string, percentage: number, todayCount: number): Promise<void> {
    // TODO: Member 4 — implement
    logger.warn('EmailService.sendQuotaAlert: not yet implemented');
  }

  /** Triggered: POST /api/permissions/users/:id/overrides */
  async sendPermissionChange(user: IUserForEmail, changedBy: IUserForEmail, changeDescription: string, effect: 'grant' | 'deny'): Promise<void> {
    // TODO: Member 4 — implement
    logger.warn('EmailService.sendPermissionChange: not yet implemented');
  }
}

export default EmailService;
