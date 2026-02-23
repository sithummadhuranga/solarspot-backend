import type { Config } from 'jest';

const config: Config = {
  // Use ts-jest via explicit transform so we can point at tsconfig.test.json
  testEnvironment: 'node',
  testMatch: ['**/tests/integration/**/*.test.ts'],
  globalSetup: './src/tests/integration/setup.ts',
  globalTeardown: './src/tests/integration/teardown.ts',

  transform: {
    '^.+\.tsx?$': [
      'ts-jest',
      {
        // Point at a tsconfig that includes src/tests so path aliases resolve
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
  },

  moduleNameMapper: {
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
  },
  testTimeout: 30000,
  verbose: true,
};

export default config;
