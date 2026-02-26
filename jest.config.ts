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
    global: { lines: 75, functions: 75, branches: 65 },
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
