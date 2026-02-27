import dotenv from 'dotenv';

dotenv.config();

/**
 * Central configuration object — single source of truth for all env vars.
 * Validated at startup in server.ts. Never access process.env directly outside this file.
 *
 * Ref: PROJECT_OVERVIEW.md → Environment Variables Reference
 */
export const config = {
  // ── App ──────────────────────────────────────────────────
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: process.env.PORT ?? '5000',
  APP_URL: process.env.APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:3000',
  APP_NAME: process.env.APP_NAME ?? 'SolarSpot',

  // ── Database ─────────────────────────────────────────────
  MONGODB_URI: process.env.MONGODB_URI as string,           // REQUIRED
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME ?? 'solarspot',

  // ── Auth / JWT ────────────────────────────────────────────
  JWT_SECRET: process.env.JWT_SECRET as string,                    // REQUIRED — min 64 chars
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET as string,    // REQUIRED
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES ?? '15m',
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  COOKIE_SECRET: process.env.COOKIE_SECRET as string,              // REQUIRED — min 32 chars

  // ── Email (Brevo SMTP) ────────────────────────────────────
  // Supports both EMAIL_* and legacy BREVO_SMTP_* naming in .env
  EMAIL_HOST:         process.env.EMAIL_HOST         ?? process.env.BREVO_SMTP_HOST ?? 'smtp-relay.brevo.com',
  EMAIL_PORT:         parseInt(process.env.EMAIL_PORT ?? process.env.BREVO_SMTP_PORT ?? '587', 10),
  EMAIL_SECURE:       (process.env.EMAIL_SECURE       ?? process.env.BREVO_SMTP_SECURE ?? '') === 'true',
  EMAIL_USER:         process.env.EMAIL_USER          ?? process.env.BREVO_SMTP_USER  ?? '',
  EMAIL_PASS:         process.env.EMAIL_PASS          ?? process.env.BREVO_SMTP_PASS  ?? '',
  EMAIL_FROM_NAME:    process.env.EMAIL_FROM_NAME    ?? 'SolarSpot',
  EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS ?? process.env.EMAIL_FROM ?? 'solarspotplatform@gmail.com',
  // DEV ONLY — when true, writes email HTML to console/tmp instead of sending
  EMAIL_PREVIEW: process.env.EMAIL_PREVIEW === 'true',

  // ── Third-party APIs ─────────────────────────────────────
  // Accepts both OPENWEATHERMAP_API_KEY (.env default) and OPENWEATHER_API_KEY
  OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY ?? process.env.OPENWEATHERMAP_API_KEY ?? '',  // REQUIRED for weather
  PERSPECTIVE_API_KEY: process.env.PERSPECTIVE_API_KEY as string,  // REQUIRED for moderation

  // ── Cloudinary (image CDN) ────────────────────────────────
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME as string,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY as string,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET as string,

  // ── CORS ──────────────────────────────────────────────────
  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:3000',
};
