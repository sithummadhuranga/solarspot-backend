import nodemailer, { Transporter } from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { config } from '@config/env';
import logger from '@utils/logger';
import { ThirdPartyService } from '@modules/permissions/models/quota-usage.model';
import mongoose from 'mongoose';

// ─── Dependency Inversion: Abstract mail transport interface ───────────────
export interface IMailTransport {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void>;
}

// ─── Concrete Implementation: Brevo SMTP Transport ──────────────────────────
class BrevoTransport implements IMailTransport {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.BREVO_SMTP_HOST,
      port: Number(config.BREVO_SMTP_PORT ?? 587),
      secure: false,
      auth: {
        user: config.BREVO_SMTP_USER,
        pass: config.BREVO_SMTP_PASS,
      },
    });
  }

  async sendMail(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    await this.transporter.sendMail(options);
  }
}

// ─── EmailService Class (Single Responsibility: sending emails) ────────────
class EmailService {
  private transport: IMailTransport;

  constructor(transport: IMailTransport) {
    this.transport = transport;
  }

  /**
   * Load a template file and replace variables.
   */
  private loadTemplate(
    templateName: string,
    variables: Record<string, string>,
    format: 'html' | 'txt' = 'html'
  ): string {
    const templatePath = path.join(
      __dirname,
      '..',
      'templates',
      `${templateName}.${format}`
    );

    if (!fs.existsSync(templatePath)) {
      logger.error(`Template not found: ${templatePath}`);
      throw new Error(`Email template not found: ${templateName}.${format}`);
    }

    let template = fs.readFileSync(templatePath, 'utf-8');

    // Replace all variables
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      template = template.replace(placeholder, value);
    }

    return template;
  }

  /**
   * Get universal template variables (used in all emails).
   */
  private getUniversalVars(): Record<string, string> {
    return {
      APP_NAME: 'SolarSpot',
      APP_URL: config.FRONTEND_URL ?? 'http://localhost:3000',
      YEAR: new Date().getFullYear().toString(),
    };
  }

  /**
   * Send verification email to new user.
   */
  async sendVerificationEmail(
    to: string,
    displayName: string,
    verificationToken: string
  ): Promise<void> {
    const verifyUrl = `${config.FRONTEND_URL}/verify-email/${verificationToken}`;

    const vars = {
      ...this.getUniversalVars(),
      DISPLAY_NAME: displayName,
      VERIFY_URL: verifyUrl,
      EXPIRY_HOURS: '24',
    };

    const html = this.loadTemplate('verify-email', vars, 'html');
    const text = this.loadTemplate('verify-email', vars, 'txt');

    await this.transport.sendMail({
      from: `"SolarSpot" <${config.EMAIL_FROM}>`,
      to,
      subject: 'Verify Your Email — SolarSpot',
      html,
      text,
    });

    logger.info(`Verification email sent to ${to}`);
  }

  /**
   * Send password reset email.
   */
  async sendPasswordResetEmail(
    to: string,
    displayName: string,
    resetToken: string
  ): Promise<void> {
    const resetUrl = `${config.FRONTEND_URL}/reset-password/${resetToken}`;

    const vars = {
      ...this.getUniversalVars(),
      DISPLAY_NAME: displayName,
      RESET_URL: resetUrl,
      EXPIRY_MINUTES: '10',
    };

    const html = this.loadTemplate('reset-password', vars, 'html');
    const text = this.loadTemplate('reset-password', vars, 'txt');

    await this.transport.sendMail({
      from: `"SolarSpot" <${config.EMAIL_FROM}>`,
      to,
      subject: 'Reset Your Password — SolarSpot',
      html,
      text,
    });

    logger.info(`Password reset email sent to ${to}`);
  }

  /**
   * Send welcome email after email verification.
   */
  async sendWelcomeEmail(to: string, displayName: string): Promise<void> {
    const mapUrl = `${config.FRONTEND_URL}/map`;

    const vars = {
      ...this.getUniversalVars(),
      DISPLAY_NAME: displayName,
      MAP_URL: mapUrl,
    };

    const html = this.loadTemplate('welcome', vars, 'html');
    const text = this.loadTemplate('welcome', vars, 'txt');

    await this.transport.sendMail({
      from: `"SolarSpot" <${config.EMAIL_FROM}>`,
      to,
      subject: 'Welcome to SolarSpot! 🎉',
      html,
      text,
    });

    logger.info(`Welcome email sent to ${to}`);
  }

  /**
   * Send station approved notification (for M1 — Station module).
   */
  async sendStationApprovedEmail(
    userId: mongoose.Types.ObjectId,
    stationName: string,
    stationId: string
  ): Promise<void> {
    // Dynamic import to avoid circular dependency
    const { default: User } = await import('@modules/users/user.model');

    const user = await User.findById(userId).lean();
    if (!user) {
      logger.warn(`User not found for station approval email`, { userId });
      return;
    }

    const stationUrl = `${config.FRONTEND_URL}/stations/${stationId}`;

    const vars = {
      ...this.getUniversalVars(),
      DISPLAY_NAME: user.displayName,
      STATION_NAME: stationName,
      STATION_URL: stationUrl,
    };

    const html = this.loadTemplate('station-approved', vars, 'html');
    const text = this.loadTemplate('station-approved', vars, 'txt');

    await this.transport.sendMail({
      from: `"SolarSpot" <${config.EMAIL_FROM}>`,
      to: user.email,
      subject: 'Your Station Has Been Approved! ✅',
      html,
      text,
    });

    logger.info(`Station approved email sent to ${user.email}`, { stationId, stationName });
  }

  /**
   * Send station rejected notification (for M1 — Station module).
   */
  async sendStationRejectionEmail(
    userId: mongoose.Types.ObjectId,
    stationName: string,
    rejectionReason: string
  ): Promise<void> {
    // Dynamic import to avoid circular dependency
    const { default: User } = await import('@modules/users/user.model');

    const user = await User.findById(userId).lean();
    if (!user) {
      logger.warn(`User not found for station rejection email`, { userId });
      return;
    }

    const vars = {
      ...this.getUniversalVars(),
      DISPLAY_NAME: user.displayName,
      STATION_NAME: stationName,
      REJECTION_REASON: rejectionReason,
    };

    const html = this.loadTemplate('station-rejected', vars, 'html');
    const text = this.loadTemplate('station-rejected', vars, 'txt');

    await this.transport.sendMail({
      from: `"SolarSpot" <${config.EMAIL_FROM}>`,
      to: user.email,
      subject: 'Station Submission Update — SolarSpot',
      html,
      text,
    });

    logger.info(`Station rejection email sent to ${user.email}`, { stationName });
  }

  /**
   * Send quota alert to all admins (when 80% threshold reached).
   */
  async sendQuotaAlertEmail(
    service: ThirdPartyService,
    percentage: number,
    count: number,
    limit: number
  ): Promise<void> {
    // Dynamic import to avoid circular dependency
    const { default: User } = await import('@modules/users/user.model');

    const admins = await User.find({ role: 'admin', isActive: true }).lean();

    if (admins.length === 0) {
      logger.warn('No active admins found for quota alert email');
      return;
    }

    const remaining = limit - count;

    const vars = {
      ...this.getUniversalVars(),
      SERVICE_NAME: service.toUpperCase(),
      PERCENTAGE: percentage.toFixed(2),
      TODAY_COUNT: count.toString(),
      LIMIT: limit.toString(),
      REMAINING: remaining.toString(),
    };

    const html = this.loadTemplate('quota-alert', vars, 'html');
    const text = this.loadTemplate('quota-alert', vars, 'txt');

    for (const admin of admins) {
      await this.transport.sendMail({
        from: `"SolarSpot Alerts" <${config.EMAIL_FROM}>`,
        to: admin.email,
        subject: `⚠️ Quota Alert: ${service} at ${percentage.toFixed(0)}%`,
        html,
        text,
      });
    }

    logger.info(`Quota alert emails sent to ${admins.length} admins`, {
      service,
      percentage,
      count,
      limit,
    });
  }

  /**
   * Send permission change notification to user.
   */
  async sendPermissionChangeEmail(
    targetUserId: string | mongoose.Types.ObjectId,
    changedByUserId: string | mongoose.Types.ObjectId,
    changeDescription: string,
    effect: 'grant' | 'deny',
    reason: string,
    impactDescription: string
  ): Promise<void> {
    // Dynamic import to avoid circular dependency
    const { default: User } = await import('@modules/users/user.model');

    const [targetUser, changedByUser] = await Promise.all([
      User.findById(targetUserId).lean(),
      User.findById(changedByUserId).lean(),
    ]);

    if (!targetUser) {
      logger.warn(`Target user not found for permission change email`, { targetUserId });
      return;
    }

    if (!changedByUser) {
      logger.warn(`ChangedBy user not found for permission change email`, { changedByUserId });
      return;
    }

    const vars = {
      ...this.getUniversalVars(),
      DISPLAY_NAME: targetUser.displayName,
      CHANGE_DESCRIPTION: changeDescription,
      EFFECT: effect === 'grant' ? 'Permission Granted' : 'Permission Denied',
      IMPACT_DESCRIPTION: impactDescription,
      CHANGED_BY_NAME: changedByUser.displayName,
      REASON: reason,
    };

    const html = this.loadTemplate('permission-change', vars, 'html');
    const text = this.loadTemplate('permission-change', vars, 'txt');

    await this.transport.sendMail({
      from: `"SolarSpot" <${config.EMAIL_FROM}>`,
      to: targetUser.email,
      subject: 'Permission Changed — SolarSpot',
      html,
      text,
    });

    logger.info(`Permission change email sent to ${targetUser.email}`, {
      targetUserId,
      effect,
      reason,
    });
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────
// Instantiate the email service with Brevo transport
const emailService = new EmailService(new BrevoTransport());

export default emailService;
export { EmailService, BrevoTransport };
