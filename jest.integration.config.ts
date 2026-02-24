import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/integration/**/*.test.ts'],
  globalSetup: './src/tests/integration/setup.ts',
  globalTeardown: './src/tests/integration/teardown.ts',
  moduleNameMapper: {
    '^@/(.*)$':          '<rootDir>/src/$1',
    '^@config/(.*)$':    '<rootDir>/src/config/$1',
    '^@middleware/(.*)$':'<rootDir>/src/middleware/$1',
    '^@modules/(.*)$':   '<rootDir>/src/modules/$1',
    '^@services/(.*)$':  '<rootDir>/src/services/$1',
    '^@utils/(.*)$':     '<rootDir>/src/utils/$1',
  },
  testTimeout: 30000,
  verbose: true,
};

export default config;
