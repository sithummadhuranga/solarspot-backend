# Backend Testing Guide

This guide covers how to test SolarSpot Backend before submission.

## 1. Test Scope

- Static checks: linting
- Build checks: TypeScript compilation
- Unit tests
- Integration tests
- Coverage report
- Performance baseline (Artillery)

## 2. Prerequisites

- Node.js 20+
- Dependencies installed (`npm ci`)
- For integration tests, ensure MongoDB test dependencies are available

Install and prepare:

```bash
npm ci
```

## 3. Fast Validation Flow (Recommended)

Run this sequence before each commit/PR:

```bash
npm run lint
npm run build
npm test
```

## 4. Detailed Test Commands

### Lint

```bash
npm run lint
```

What it does:

- Runs ESLint on `src`, `app.ts`, and `server.ts`
- Fails on warnings (`--max-warnings=0`)

### Build

```bash
npm run build
```

What it does:

- Compiles TypeScript
- Rewrites path aliases
- Copies email templates into `dist`

### Unit Tests

```bash
npm run test:unit
```

### Integration Tests

```bash
npm run test:integration
```

Alternative (Docker):

```bash
docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit
```

### Coverage

```bash
npm run test:coverage
```

Coverage output:

- `coverage/lcov-report/index.html`
- `coverage/lcov.info`

### Performance Tests

```bash
npm run test:perf
npm run test:perf:report
```

Generated artifacts:

- `report.json`
- Console report from Artillery

## 5. Suggested Submission Test Matrix

Run and record result status for:

1. `npm run lint`
2. `npm run build`
3. `npm run test`
4. `npm run test:integration`
5. `npm run test:coverage`

Optional but useful:

6. `npm run test:perf`

## 6. API Validation for Marker Demo

Use Postman collection/manual requests to verify:

- Health endpoint: `GET /api/health`
- Auth flow: register/login/refresh
- Protected routes with bearer tokens
- Role-based access endpoints
- Core modules: stations, reviews, users, weather

Reference detailed request examples in `POSTMAN_TESTING.md`.

## 7. Common Testing Failures and Fixes

- Lint fails:
  - Run `npm run lint` and fix reported files.
- Build fails with path alias/module errors:
  - Confirm `tsconfig.json` path config and import aliases.
- Integration tests fail due to environment:
  - Confirm required env vars for test mode.
  - Ensure test DB setup is isolated.
- Coverage not generated:
  - Re-run `npm run test:coverage` and check Jest output for failing suites.

## 8. Final Submission Checklist

- All mandatory commands pass locally.
- Coverage report generated and accessible.
- No failing integration tests.
- Postman smoke tests complete.
- Screenshots/logs ready as evidence.
