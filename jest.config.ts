import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/tests/**',
    '!src/config/swagger.ts',
    '!src/templates/**',
  ],
  coverageThreshold: {
    // Global is intentionally minimal while only one member's tests exist.
    // Each team member adds their own per-file entry when implementing their tests.
    // Tighten global values once all modules have coverage.
    global: { lines: 0, functions: 0, branches: 0 },
    // ── Member 1 — Stations (80%+ per §9.1) ──────────────────────────────
    './src/modules/stations/station.service.ts': { lines: 80, functions: 80, branches: 70 },
    // ── Member 3 — Weather Intelligence (80%+ per §9.1) ──────────────────
    './src/modules/weather/weather.service.ts':  { lines: 80, functions: 80, branches: 70 },
    // ── Members 2/4 add their entries below when implementing their tests ─
    // './src/modules/reviews/review.service.ts':  { lines: 80, functions: 80, branches: 70 },
    // './src/modules/auth/auth.service.ts':        { lines: 80, functions: 80, branches: 70 },
    // './src/modules/users/user.service.ts':       { lines: 80, functions: 80, branches: 70 },
  },
  moduleNameMapper: {
    '^@/(.*)$':          '<rootDir>/src/$1',
    '^@config/(.*)$':    '<rootDir>/src/config/$1',
    '^@middleware/(.*)$':'<rootDir>/src/middleware/$1',
    '^@modules/(.*)$':   '<rootDir>/src/modules/$1',
    '^@services/(.*)$':  '<rootDir>/src/services/$1',
    '^@utils/(.*)$':     '<rootDir>/src/utils/$1',
  },
  verbose: true,
};

export default config;
