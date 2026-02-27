/**
 * Integration test environment setup — setupFiles entry point.
 * Runs in every Jest worker BEFORE any test file is loaded (before static imports execute).
 * Sets environment variables so that config/env.ts reads the correct test values when first imported.
 */

// ── Required env vars ────────────────────────────────────────────────────────
process.env.NODE_ENV         = 'test';
process.env.JWT_SECRET       = 'test-jwt-secret-for-integration-tests-minimum-64-chars-padding!!';
process.env.COOKIE_SECRET    = 'test-cookie-secret-32chars-padding';
process.env.MONGODB_URI      = 'mongodb://localhost:27017/solarspot_test'; // overridden per-file by MongoMemoryServer

// Email — point to a fake SMTP so tests don't accidentally send
process.env.EMAIL_PREVIEW    = 'true';
process.env.EMAIL_USER       = 'test@solarspot.dev';
process.env.EMAIL_PASS       = 'test-password';

// Third-party keys — not used in station tests but must be present
process.env.OPENWEATHER_API_KEY  = 'test-openweather-key';
process.env.PERSPECTIVE_API_KEY  = 'test-perspective-key';
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY    = 'test-key';
process.env.CLOUDINARY_API_SECRET = 'test-secret';
