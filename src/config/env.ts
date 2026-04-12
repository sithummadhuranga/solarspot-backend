import dotenv from 'dotenv';

dotenv.config();


export const config = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: process.env.PORT ?? '5000',
  APP_URL: process.env.APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:3000',
  APP_NAME: process.env.APP_NAME ?? 'SolarSpot',

  MONGODB_URI: process.env.MONGODB_URI as string,           // REQUIRED
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME ?? 'solarspot',
  RUN_SEED: process.env.RUN_SEED ?? '',

  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? '',

  JWT_SECRET: process.env.JWT_SECRET as string,                    // REQUIRED — min 64 chars
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET as string,    // REQUIRED
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES ?? '15m',
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  COOKIE_SECRET: process.env.COOKIE_SECRET as string,              // REQUIRED — min 32 chars

  EMAIL_TRANSPORT:    (process.env.EMAIL_TRANSPORT ?? '').trim().toLowerCase(),
  BREVO_API_KEY:      process.env.BREVO_API_KEY ?? '',
  BREVO_API_BASE_URL: process.env.BREVO_API_BASE_URL ?? 'https://api.brevo.com/v3',
  EMAIL_HOST:         process.env.EMAIL_HOST         ?? process.env.BREVO_SMTP_HOST ?? 'smtp-relay.brevo.com',
  EMAIL_PORT:         parseInt(process.env.EMAIL_PORT ?? process.env.BREVO_SMTP_PORT ?? '587', 10),
  EMAIL_SECURE:       (process.env.EMAIL_SECURE       ?? process.env.BREVO_SMTP_SECURE ?? '') === 'true',
  EMAIL_USER:         process.env.EMAIL_USER          ?? process.env.BREVO_SMTP_USER  ?? '',
  EMAIL_PASS:         process.env.EMAIL_PASS          ?? process.env.BREVO_SMTP_PASS  ?? '',
  EMAIL_FROM_NAME:    process.env.EMAIL_FROM_NAME    ?? 'SolarSpot',
  EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS ?? process.env.EMAIL_FROM ?? 'solarspotplatform@gmail.com',
  EMAIL_PREVIEW: process.env.EMAIL_PREVIEW === 'true',

  OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY ?? process.env.OPENWEATHERMAP_API_KEY ?? '',  // REQUIRED for weather
  PERSPECTIVE_API_KEY: process.env.PERSPECTIVE_API_KEY as string,  // Legacy — kept for backward compat

  HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY ?? '',

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME as string,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY as string,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET as string,

  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? 'http://localhost:3000')
    .split(',')
    .map(s => s.trim().replace(/\/+$/, ''))
    .filter(Boolean),
};
