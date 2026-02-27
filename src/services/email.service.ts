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
    // Extract all URLs from the HTML body so tokens are always visible
    const html = String(options.html);
    const urls = html.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    urls.forEach(url => logger.info(`[EmailPreview] URL: ${url}`));
    logger.debug(`[EmailPreview] Body: ${html.substring(0, 500)}...`);
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
    await this.send(
      user.email,
      `Verify your email — ${config.APP_NAME}`,
      'verify-email',
      {
        USER_NAME: user.displayName,
        VERIFY_URL: verifyUrl,
      },
    );
  }

  /** Triggered: POST /api/auth/forgot-password */
  async sendPasswordReset(user: IUserForEmail, resetUrl: string): Promise<void> {
    await this.send(
      user.email,
      `Reset your password — ${config.APP_NAME}`,
      'reset-password',
      {
        USER_NAME: user.displayName,
        RESET_URL: resetUrl,
      },
    );
  }

  /** Triggered: GET /api/auth/verify-email/:token (after successful verification) */
  async sendWelcome(user: IUserForEmail): Promise<void> {
    await this.send(
      user.email,
      `Welcome to ${config.APP_NAME}!`,
      'welcome',
      {
        USER_NAME: user.displayName,
        MAP_URL: `${config.APP_URL}/map`,
      },
    );
  }

  /** Triggered: PATCH /api/stations/:id/approve */
  async sendStationApproved(user: IUserForEmail, stationName: string, stationUrl: string): Promise<void> {
    await this.send(
      user.email,
      `Your station has been approved — ${config.APP_NAME}`,
      'station-approved',
      {
        USER_NAME: user.displayName,
        STATION_NAME: stationName,
        STATION_URL: stationUrl,
      },
    );
  }

  /** Triggered: PATCH /api/stations/:id/reject */
  async sendStationRejected(user: IUserForEmail, stationName: string, reason: string): Promise<void> {
    await this.send(
      user.email,
      `Your station submission needs revision — ${config.APP_NAME}`,
      'station-rejected',
      {
        USER_NAME: user.displayName,
        STATION_NAME: stationName,
        REJECTION_REASON: reason,
      },
    );
  }

  /** Triggered: QuotaService when 80% threshold is hit */
  async sendQuotaAlert(adminEmail: string, serviceName: string, percentage: number, todayCount: number): Promise<void> {
    await this.send(
      adminEmail,
      `⚠️ Quota Alert: ${serviceName} at ${percentage}% — ${config.APP_NAME}`,
      'quota-alert',
      {
        SERVICE_NAME: serviceName,
        PERCENTAGE: String(percentage),
        TODAY_COUNT: String(todayCount),
      },
    );
  }

  /** Triggered: POST /api/permissions/users/:id/overrides */
  async sendPermissionChange(user: IUserForEmail, changedBy: IUserForEmail, changeDescription: string, effect: 'grant' | 'deny'): Promise<void> {
    await this.send(
      user.email,
      `Your permissions have been updated — ${config.APP_NAME}`,
      'permission-change',
      {
        USER_NAME: user.displayName,
        CHANGED_BY: changedBy.displayName,
        CHANGE_DESCRIPTION: changeDescription,
        EFFECT: effect.toUpperCase(),
      },
    );
  }
}

export default EmailService;
