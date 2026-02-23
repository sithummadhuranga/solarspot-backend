import type { Config } from 'jest';

const config: Config = {
  // Use ts-jest preset but override the transform with explicit tsconfig
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.test.ts'],

  transform: {
    '^.+\.tsx?$': [
      'ts-jest',
      {
        // Point at a tsconfig that includes src/tests so path aliases resolve
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
  },

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
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
  },
  verbose: true,
};

export default config;
