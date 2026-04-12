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
    global: { lines: 0, functions: 0, branches: 0 },
    './src/modules/stations/station.service.ts': { lines: 80, functions: 80, branches: 70 },
    './src/modules/weather/weather.service.ts':  { lines: 80, functions: 80, branches: 70 },
    './src/modules/reviews/review.service.ts':  { lines: 80, functions: 80, branches: 70 },
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
