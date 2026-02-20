import dotenv from 'dotenv';

dotenv.config();

/**
 * Central configuration object built from environment variables.
 * Keys marked REQUIRED will throw at startup if missing (handled in server.ts).
 */
export const config = {
  // ── Server ──────────────────────────────────────────────
  PORT: process.env.PORT ?? '5000',                         // optional — default 5000
  NODE_ENV: process.env.NODE_ENV ?? 'development',          // optional — default development

  // ── Database ─────────────────────────────────────────────
  MONGODB_URI: process.env.MONGODB_URI as string,           // REQUIRED

  // ── JWT ──────────────────────────────────────────────────
  JWT_SECRET: process.env.JWT_SECRET as string,             // REQUIRED
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET as string, // REQUIRED
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES ?? '15m',  // optional
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES ?? '7d', // optional

  // ── Third-party APIs ─────────────────────────────────────
  OPENWEATHERMAP_API_KEY: process.env.OPENWEATHERMAP_API_KEY as string, // REQUIRED
  PERSPECTIVE_API_KEY: process.env.PERSPECTIVE_API_KEY as string,       // optional

  // ── Brevo SMTP (email) ────────────────────────────────────
  BREVO_SMTP_HOST: process.env.BREVO_SMTP_HOST ?? 'smtp-relay.brevo.com', // optional
  BREVO_SMTP_PORT: process.env.BREVO_SMTP_PORT ?? '587',                   // optional
  BREVO_SMTP_USER: process.env.BREVO_SMTP_USER as string,                  // REQUIRED for email
  BREVO_SMTP_PASS: process.env.BREVO_SMTP_PASS as string,                  // REQUIRED for email
  EMAIL_FROM: process.env.EMAIL_FROM ?? 'noreply@solarspot.app',           // optional

  // ── CORS ──────────────────────────────────────────────────
  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:3000',       // optional
};
