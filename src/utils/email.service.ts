import nodemailer from 'nodemailer';
import { config } from '@config/env';
import logger from '@utils/logger';

// ─── Transport ────────────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host: config.BREVO_SMTP_HOST,
  port: Number(config.BREVO_SMTP_PORT ?? 587),
  secure: false, // STARTTLS on port 587
  auth: {
    user: config.BREVO_SMTP_USER,
    pass: config.BREVO_SMTP_PASS,
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const baseTemplate = (title: string, body: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .wrapper { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #10b981 100%); padding: 32px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 26px; letter-spacing: -0.5px; }
    .header p  { color: rgba(255,255,255,.85); margin: 6px 0 0; font-size: 14px; }
    .body { padding: 32px; color: #333; line-height: 1.6; }
    .body h2 { color: #1a1a1a; margin-top: 0; }
    .btn { display: inline-block; margin: 24px 0; padding: 14px 32px; background: #f59e0b; color: #fff !important; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 15px; }
    .footer { background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 20px 32px; font-size: 12px; color: #9ca3af; text-align: center; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 16px 0; font-size: 14px; color: #92400e; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>☀️ SolarSpot</h1>
      <p>Discover solar-powered charging stations near you</p>
    </div>
    <div class="body">${body}</div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} SolarSpot. All rights reserved.<br/>
      If you did not request this email, you can safely ignore it.
    </div>
  </div>
</body>
</html>
`;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send an email verification link to a newly registered user.
 * @param to            - Recipient email address
 * @param displayName   - User's display name (used in greeting)
 * @param verificationToken - RAW (unhashed) token; hashed version stored in DB
 */
export async function sendVerificationEmail(
  to: string,
  displayName: string,
  verificationToken: string
): Promise<void> {
  const link = `${config.FRONTEND_URL}/verify-email/${verificationToken}`;

  const body = `
    <h2>Hi ${displayName} 👋</h2>
    <p>Welcome to SolarSpot! Before you can start using your account, please verify your email address by clicking the button below.</p>
    <a href="${link}" class="btn">Verify my email</a>
    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break:break-all;font-size:13px;color:#6b7280;">${link}</p>
    <div class="warning">⏰ This link expires in <strong>24 hours</strong>.</div>
    <p>If you did not create a SolarSpot account, no action is required.</p>
  `;

  await transporter.sendMail({
    from: `"SolarSpot" <${config.EMAIL_FROM}>`,
    to,
    subject: 'Verify your SolarSpot email',
    html: baseTemplate('Verify your SolarSpot email', body),
  });

  logger.info(`Verification email sent to ${to}`);
}

/**
 * Send a password reset link.
 * @param to         - Recipient email address
 * @param displayName - User's display name
 * @param resetToken  - RAW (unhashed) token; hashed version stored in DB
 */
export async function sendPasswordResetEmail(
  to: string,
  displayName: string,
  resetToken: string
): Promise<void> {
  const link = `${config.FRONTEND_URL}/reset-password/${resetToken}`;

  const body = `
    <h2>Password reset request</h2>
    <p>Hi ${displayName},</p>
    <p>We received a request to reset the password for your SolarSpot account. Click the button below to choose a new password:</p>
    <a href="${link}" class="btn">Reset my password</a>
    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break:break-all;font-size:13px;color:#6b7280;">${link}</p>
    <div class="warning">⚠️ This link expires in <strong>10 minutes</strong>. If it has expired, please request a new one.</div>
    <p>If you did not request a password reset, please ignore this email — your password will not be changed.</p>
  `;

  await transporter.sendMail({
    from: `"SolarSpot" <${config.EMAIL_FROM}>`,
    to,
    subject: 'Reset your SolarSpot password',
    html: baseTemplate('Reset your SolarSpot password', body),
  });

  logger.info(`Password reset email sent to ${to}`);
}

/**
 * Notify a user that their station submission was not approved.
 * @param to              - Recipient email address
 * @param displayName     - User's display name
 * @param stationName     - Name of the rejected station
 * @param rejectionReason - Moderator's rejection reason
 */
export async function sendStationRejectionEmail(
  to: string,
  displayName: string,
  stationName: string,
  rejectionReason: string
): Promise<void> {
  const body = `
    <h2>Station submission update</h2>
    <p>Hi ${displayName},</p>
    <p>Thank you for contributing to SolarSpot! Unfortunately, your submission for <strong>${stationName}</strong> was not approved at this time.</p>
    <div class="warning">
      <strong>Reason:</strong> ${rejectionReason}
    </div>
    <p>We encourage you to review the feedback above and resubmit your station with the requested changes. Our community thrives on accurate, up-to-date charging station data.</p>
    <p>If you believe this decision was made in error, please contact our support team.</p>
    <p>Thank you for your understanding and continued support! ☀️</p>
  `;

  await transporter.sendMail({
    from: `"SolarSpot" <${config.EMAIL_FROM}>`,
    to,
    subject: 'Your station submission was not approved',
    html: baseTemplate('Station submission update', body),
  });

  logger.info(`Station rejection email sent to ${to} for station "${stationName}"`);
}

export default { sendVerificationEmail, sendPasswordResetEmail, sendStationRejectionEmail };
