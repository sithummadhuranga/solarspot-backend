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
import axios from 'axios';
import nodemailer, { Transporter } from 'nodemailer';
import { config } from '@config/env';
import logger from '@utils/logger';
import { IUserForEmail } from '@/types';

type EmailTransportMode = 'preview' | 'smtp' | 'brevo-api';

function parseMailbox(value: string): { email: string; name?: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(?:"?([^"<>]+)"?\s*)?<([^<>]+)>$/);

  if (match) {
    const [, name, email] = match;
    return {
      email: email.trim(),
      name: name?.trim() || undefined,
    };
  }

  return { email: trimmed };
}

function normalizeRecipients(value: nodemailer.SendMailOptions['to']): Array<{ email: string; name?: string }> {
  const entries = Array.isArray(value) ? value : value ? [value] : [];

  return entries.flatMap((entry) => {
    if (!entry) return [];

    if (typeof entry === 'string') {
      return entry
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .map(parseMailbox);
    }

    if (typeof entry === 'object' && 'address' in entry && typeof entry.address === 'string') {
      return [{
        email: entry.address.trim(),
        name: typeof entry.name === 'string' ? entry.name.trim() || undefined : undefined,
      }];
    }

    return [];
  });
}

function resolveTransportMode(): EmailTransportMode {
  if (config.EMAIL_PREVIEW || config.EMAIL_TRANSPORT === 'preview') {
    return 'preview';
  }

  if (config.EMAIL_TRANSPORT === 'brevo-api') {
    return 'brevo-api';
  }

  return 'smtp';
}

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

class BrevoApiTransport implements IMailTransport {
  async sendMail(options: nodemailer.SendMailOptions): Promise<void> {
    if (!config.BREVO_API_KEY) {
      throw new Error('BREVO_API_KEY is required when EMAIL_TRANSPORT=brevo-api');
    }

    const to = normalizeRecipients(options.to);
    if (to.length === 0) {
      throw new Error('EmailService.send called without a valid recipient');
    }

    const sender = config.EMAIL_FROM_ADDRESS
      ? { email: config.EMAIL_FROM_ADDRESS, name: config.EMAIL_FROM_NAME }
      : normalizeRecipients(options.from)[0];

    if (!sender?.email) {
      throw new Error('EmailService.send called without a valid sender address');
    }

    try {
      await axios.post(
        `${config.BREVO_API_BASE_URL.replace(/\/+$/, '')}/smtp/email`,
        {
          sender,
          to,
          subject: options.subject,
          htmlContent: typeof options.html === 'string' ? options.html : String(options.html ?? ''),
        },
        {
          headers: {
            accept: 'application/json',
            'api-key': config.BREVO_API_KEY,
            'content-type': 'application/json',
          },
          timeout: 15000,
        },
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const responseData = error.response?.data;
        const details = typeof responseData === 'string'
          ? responseData
          : responseData
            ? JSON.stringify(responseData)
            : error.message;

        throw new Error(`Brevo API request failed${status ? ` with status ${status}` : ''}: ${details}`);
      }

      throw error;
    }
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
  private readonly transportMode: EmailTransportMode;
  private readonly templatesDir = path.join(__dirname, '../templates');

  constructor(transport?: IMailTransport) {
    this.transportMode = resolveTransportMode();
    this.transport = transport ?? this.createTransport(this.transportMode);
    logger.info(`EmailService initialized with ${this.transportMode} transport`);
  }

  private createTransport(mode: EmailTransportMode): IMailTransport {
    switch (mode) {
      case 'preview':
        return new PreviewTransport();
      case 'brevo-api':
        return new BrevoApiTransport();
      case 'smtp':
      default:
        return new NodemailerTransport();
    }
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
      logger.error(`EmailService.send failed for template "${templateName}" via ${this.transportMode}:`, err);
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
