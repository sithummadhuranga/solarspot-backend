# Cucumber BDD Testing — Full Guide
### SolarSpot Backend · SE3010/SE3040 Assignment

---

## Table of Contents

1. [What is BDD and Cucumber?](#1-what-is-bdd-and-cucumber)
2. [How Cucumber Works — The Flow](#2-how-cucumber-works--the-flow)
3. [File Structure](#3-file-structure)
4. [File-by-File Explanation](#4-file-by-file-explanation)
   - [cucumber.js](#41-cucumberjs)
   - [tsconfig.cucumber.json](#42-tsconfigcucumberjson)
   - [env.setup.ts](#43-envsetupts)
   - [world.ts](#44-worldts)
   - [hooks.ts](#45-hooksts)
   - [stations.feature](#46-stationsfeature)
   - [stations.steps.ts](#47-stationsstepsts)
5. [How the Test Run Works Step by Step](#5-how-the-test-run-works-step-by-step)
6. [Running the Tests](#6-running-the-tests)
7. [Reading the Results](#7-reading-the-results)
8. [Gherkin Syntax Reference](#8-gherkin-syntax-reference)
9. [Why These Specific Scenarios?](#9-why-these-specific-scenarios)
10. [Viva Talking Points](#10-viva-talking-points)

---

## 1. What is BDD and Cucumber?

**BDD (Behaviour-Driven Development)** is a software development approach where you describe what the system *should do* in plain English before writing any code. It bridges the gap between:

- **Business stakeholders** (who understand requirements)
- **Developers** (who write code)
- **Testers** (who verify behaviour)

**Cucumber** is the most popular BDD tool. It reads plain-English scenario files (`.feature` files written in **Gherkin** language) and matches each line to a TypeScript/JavaScript function that actually runs the test. If all functions pass, the scenario passes.

```
Plain English Scenario  →  Cucumber  →  TypeScript Step Functions  →  Pass / Fail
```

---

## 2. How Cucumber Works — The Flow

```
┌─────────────────────────────────────────────────────────┐
│                   cucumber.js (config)                   │
│  Tells Cucumber where to find features and step files   │
└──────────────────────────┬──────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │   env.setup.ts          │  ← Runs FIRST
              │   Sets process.env vars │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │   world.ts              │  ← Runs SECOND
              │   Defines shared state  │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │   hooks.ts              │  ← Runs THIRD
              │   Starts DB, seeds data │
              └────────────┬────────────┘
                           │
         ┌─────────────────▼──────────────────┐
         │           For each Scenario:        │
         │                                     │
         │  1. Before hook → reset World state │
         │  2. Read Gherkin line               │
         │  3. Match to step definition        │
         │  4. Call the TypeScript function    │
         │  5. If throws → FAILED              │
         │  6. If returns → PASSED             │
         └─────────────────────────────────────┘
```

---

## 3. File Structure

```
solarspot-backend/
├── cucumber.js                          ← Runner configuration (entry point)
├── tsconfig.cucumber.json               ← TypeScript config for Cucumber
└── src/
    └── tests/
        └── cucumber/
            ├── features/
            │   └── stations.feature     ← Plain-English test scenarios (Gherkin)
            ├── steps/
            │   └── stations.steps.ts    ← TypeScript functions that run each line
            ├── support/
            │   ├── env.setup.ts         ← Environment variables setup
            │   ├── world.ts             ← Shared state between steps
            │   └── hooks.ts             ← DB setup/teardown lifecycle
            └── reports/
                └── cucumber-report.html ← Auto-generated visual HTML report
```

---

## 4. File-by-File Explanation

---

### 4.1 `cucumber.js`

**Location**: root of the project  
**Purpose**: The main configuration file. Cucumber reads this first to know *where* everything is.

```javascript
module.exports = {
  default: {
    requireModule: ['ts-node/register'],       // (1) Enable TypeScript execution
    require: [
      'src/tests/cucumber/support/env.setup.ts',  // (2) Load env vars FIRST
      'src/tests/cucumber/support/world.ts',       // (3) Load World class
      'src/tests/cucumber/support/hooks.ts',       // (4) Load DB hooks
      'src/tests/cucumber/steps/**/*.ts',          // (5) Load all step definitions
    ],
    paths: ['src/tests/cucumber/features/**/*.feature'], // (6) Find feature files
    format: [
      'progress-bar',                                     // (7a) Terminal output
      'html:src/tests/cucumber/reports/cucumber-report.html', // (7b) HTML report
    ],
    timeout: 60000,    // (8) 60 seconds max per step
    publishQuiet: true, // (9) Don't publish to cucumber.io cloud
  },
};
```

**Line-by-line explanation:**

| # | What it does |
|---|---|
| 1 | `ts-node/register` makes Node.js understand TypeScript files without needing to compile them first |
| 2–5 | `require` loads support files in **order** — env vars must be first so the app can start |
| 6 | `paths` tells Cucumber which `.feature` files contain the scenarios to run |
| 7a | `progress-bar` shows a live progress bar in the terminal while tests run |
| 7b | `html:...` generates a clickable visual report you can open in a browser |
| 8 | `timeout` gives 60 seconds per step before it is automatically failed (important because MongoDB startup can be slow) |

---

### 4.2 `tsconfig.cucumber.json`

**Location**: root of the project  
**Purpose**: A separate TypeScript configuration specifically for Cucumber tests. The main `tsconfig.json` is too strict and excludes test files.

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",       // CommonJS required — Cucumber does not support ESModules
    "strict": true,
    "esModuleInterop": true,
    "noImplicitReturns": false, // Relaxed — test functions don't always return values
    "baseUrl": ".",
    "paths": {                  // Path aliases — @modules/* maps to src/modules/*
      "@/*":           ["src/*"],
      "@config/*":     ["src/config/*"],
      "@middleware/*": ["src/middleware/*"],
      "@modules/*":    ["src/modules/*"],
      "@services/*":   ["src/services/*"],
      "@utils/*":      ["src/utils/*"]
    }
  },
  "ts-node": {
    "require": ["tsconfig-paths/register"], // Resolves @module/* aliases at runtime
    "transpileOnly": true,  // Skip full type-checking — dramatically speeds up startup
    "files": true
  }
}
```

**Why a separate tsconfig?**

The main `tsconfig.json` has `noImplicitReturns: true` which would cause TypeScript errors in step definition functions (they are `void` functions, not always returning). The Cucumber-specific config relaxes this and adds `transpileOnly: true` to skip slow type-checking during test runs.

---

### 4.3 `env.setup.ts`

**Location**: `src/tests/cucumber/support/env.setup.ts`  
**Purpose**: Sets all environment variables that the application needs before any project code is imported. This is critical — if any config file loads before the env vars are set, it will crash.

```typescript
// Loaded FIRST by cucumber.js (before any project code is imported)

process.env.NODE_ENV      = 'test';   // Disables rate limiting, uses test DB

process.env.JWT_SECRET    = 'test-jwt-secret-for-cucumber-tests-minimum-64-chars-padding!!';
//  ↑ Must be at least 64 characters long (enforced by the app's env validation)

process.env.COOKIE_SECRET = 'test-cookie-secret-32chars-pad!!';
process.env.MONGODB_URI   = 'mongodb://localhost:27017/solarspot_cucumber';
//  ↑ This is a placeholder — it gets overridden in BeforeAll hook by connectTestDb()
//    which spins up an in-memory MongoDB server instead

process.env.EMAIL_PREVIEW = 'true';
//  ↑ Prevents sending real emails during tests

// Third-party keys — their actual values don't matter in BDD tests,
// but the app crashes on startup if they are missing entirely
process.env.OPENWEATHER_API_KEY   = 'test-openweather-key';
process.env.PERSPECTIVE_API_KEY   = 'test-perspective-key';
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY    = 'test-key';
process.env.CLOUDINARY_API_SECRET = 'test-secret';
```

**Key concept**: In a real running server, these come from a `.env` file. In tests, we inject fake values so no real services are touched.

---

### 4.4 `world.ts`

**Location**: `src/tests/cucumber/support/world.ts`  
**Purpose**: Defines the **World** — a shared state container that is created fresh for every scenario.

```typescript
import { World, IWorldOptions, setWorldConstructor } from '@cucumber/cucumber';

export class SolarWorld extends World {
  /** The last HTTP response received from supertest */
  response: any = null;

  /** JWT access token used for authenticated requests */
  authToken: string = '';

  /** MongoDB ObjectId of a station (if needed by a scenario) */
  stationId: string | null = null;

  /** MongoDB ObjectId of the logged-in user */
  userId: string | null = null;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

// Tell Cucumber to use OUR World class instead of the default one
setWorldConstructor(SolarWorld);
```

**Why is World needed?**

Each line in a scenario (Given / When / Then) is a separate function call. They need to share data. For example:
- The `When` step makes an HTTP request and stores the result in `this.response`
- The `Then` step reads `this.response` to check the status code

Without `World`, there would be no way to pass data between steps. `this` in every step function refers to the World instance.

**A new World instance is created for every scenario** — so data from one scenario never leaks into another.

---

### 4.5 `hooks.ts`

**Location**: `src/tests/cucumber/support/hooks.ts`  
**Purpose**: Controls the database lifecycle for the entire test suite and resets per-scenario state.

```typescript
import { BeforeAll, AfterAll, Before, setDefaultTimeout } from '@cucumber/cucumber';
import { connectTestDb, disconnectTestDb, seedCore } from '../../integration/helpers';
import { Station } from '@modules/stations/station.model';

setDefaultTimeout(60 * 1000); // 60 seconds max per step
```

#### `BeforeAll` — runs once before ALL scenarios

```typescript
BeforeAll(async function () {
  await connectTestDb();
  //  ↑ Spins up a MongoMemoryReplSet (in-memory MongoDB server)
  //    This starts a real MongoDB replica set in RAM — no actual MongoDB server needed
  //    A replica set is required because the app uses transactions

  await seedCore();
  //  ↑ Inserts test data: roles, permissions, demo users, demo stations, etc.
  //    All scenarios share this seeded data

  await Station.init();
  //  ↑ Tells Mongoose to create all model indexes on MongoDB
  //    Without this, the 2dsphere spatial index for coordinates doesn't exist
  //    and the /nearby endpoint throws: "$geoNear requires a 2dsphere index"
});
```

#### `AfterAll` — runs once after ALL scenarios

```typescript
AfterAll(async function () {
  await disconnectTestDb();
  //  ↑ Drops the in-memory database and disconnects Mongoose
  //    Frees memory and closes connections cleanly
});
```

#### `Before` — runs before EACH individual scenario

```typescript
Before(function (this: SolarWorld) {
  this.response  = null;  // Clear last HTTP response
  this.authToken = '';    // Clear any stored JWT token
  this.stationId = null;  // Clear any stored station ID
  this.userId    = null;  // Clear any stored user ID
});
```

**Why reset before each scenario?** If Scenario A stores something in `this.response` and then fails, Scenario B should not accidentally read Scenario A's stale data. The reset guarantees full isolation.

---

### 4.6 `stations.feature`

**Location**: `src/tests/cucumber/features/stations.feature`  
**Purpose**: The human-readable test specification. Written in **Gherkin** language. This is the file you show to non-technical stakeholders.

```gherkin
Feature: Solar Station Browsing
  As a visitor or registered user
  I want to browse and search solar charging stations
  So that I can find convenient charging points
```

The `Feature` block describes who the user is, what they want to do, and why. This is the **user story**.

---

#### Scenario 1 — List all stations

```gherkin
Scenario: List all active stations returns a successful response
  Given the SolarSpot API is running        ← Pre-condition
  When I request the list of all stations   ← Action: GET /api/stations
  Then the response status should be 200    ← Assert: HTTP 200 OK
  And the response should contain a success true field  ← Assert: body.success === true
  And the response data should be an array  ← Assert: body.data is an array
```

**What it tests**: The basic station list endpoint works correctly when called without any parameters.

---

#### Scenario 2 — Pagination

```gherkin
Scenario: List stations with pagination parameters
  Given the SolarSpot API is running
  When I request the list of stations with page 1 and limit 5   ← GET /api/stations?page=1&limit=5
  Then the response status should be 200
  And the response should contain a success true field
```

**What it tests**: The pagination query parameters (`page` and `limit`) are accepted without errors.

---

#### Scenario 3 — Search by keyword

```gherkin
Scenario: Search stations by a keyword
  Given the SolarSpot API is running
  When I search for stations with keyword "Colombo"   ← GET /api/stations/search?q=Colombo
  Then the response status should be 200
  And the response data should be an array
```

**What it tests**: The search endpoint returns results when a valid keyword is provided.

---

#### Scenario 4 — Search without keyword (validation)

```gherkin
Scenario: Search endpoint requires a query parameter
  Given the SolarSpot API is running
  When I search for stations without providing a keyword   ← GET /api/stations/search (no ?q=)
  Then the response status should be 422
```

**What it tests**: If you call the search endpoint without the `q` parameter, the server correctly rejects it with HTTP 422 (Unprocessable Entity — validation error). This is a **negative test** (testing that invalid input is rejected).

---

#### Scenario 5 — Nearby with valid coordinates

```gherkin
Scenario: Find stations near a valid location
  Given the SolarSpot API is running
  When I request nearby stations at latitude 6.9271 and longitude 79.8612
  ← GET /api/stations/nearby?lat=6.9271&lng=79.8612
  ← (Colombo, Sri Lanka coordinates)
  Then the response status should be 200
  And the response data should be an array
```

**What it tests**: The geospatial nearby endpoint works correctly when valid latitude and longitude are both provided.

---

#### Scenario 6 — Nearby with only latitude (negative test)

```gherkin
Scenario: Nearby endpoint requires both latitude and longitude
  Given the SolarSpot API is running
  When I request nearby stations with only latitude 6.9271   ← GET /api/stations/nearby?lat=6.9271
  Then the response status should be 422
```

**What it tests**: If `lng` is missing, the server returns 422 instead of crashing.

---

#### Scenario 7 — Nearby with only longitude (negative test)

```gherkin
Scenario: Nearby endpoint rejects a missing latitude
  Given the SolarSpot API is running
  When I request nearby stations with only longitude 79.8612   ← GET /api/stations/nearby?lng=79.8612
  Then the response status should be 422
```

**What it tests**: If `lat` is missing, the server returns 422 instead of crashing.

---

### 4.7 `stations.steps.ts`

**Location**: `src/tests/cucumber/steps/stations.steps.ts`  
**Purpose**: The TypeScript code that actually runs when each Gherkin line is matched. Every line in the `.feature` file must have exactly one matching step definition here.

```typescript
import { Given, When, Then } from '@cucumber/cucumber';
import request from 'supertest';   // HTTP testing library — makes real HTTP requests in-process
import { SolarWorld } from '../support/world';
import app from '../../../../app'; // The Express application itself
```

**`supertest`** wraps the Express `app` and lets you make HTTP requests directly in memory — no need to run the server on a real port.

---

#### Given step

```typescript
Given('the SolarSpot API is running', function (this: SolarWorld) {
  // Intentionally empty — no setup needed
  // The Express app is already loaded as an in-process import
  // This step exists only to make the Gherkin read naturally
});
```

---

#### When steps (actions — they make HTTP requests)

```typescript
When('I request the list of all stations', async function (this: SolarWorld) {
  this.response = await request(app).get('/api/stations');
  // Makes a GET request to /api/stations and stores the full response
  // this.response.status  → HTTP status code (200, 404, etc.)
  // this.response.body    → parsed JSON response body
});

When(
  'I request the list of stations with page {int} and limit {int}',
  async function (this: SolarWorld, page: number, limit: number) {
    // {int} is a Cucumber parameter — it extracts numbers from the Gherkin text
    // "page 1 and limit 5" → page=1, limit=5
    this.response = await request(app).get(`/api/stations?page=${page}&limit=${limit}`);
  },
);

When(
  'I search for stations with keyword {string}',
  async function (this: SolarWorld, keyword: string) {
    // {string} extracts the text inside quotes from Gherkin: "Colombo" → keyword="Colombo"
    this.response = await request(app).get(`/api/stations/search?q=${encodeURIComponent(keyword)}`);
  },
);

When('I search for stations without providing a keyword', async function (this: SolarWorld) {
  this.response = await request(app).get('/api/stations/search');
  // Deliberately no ?q= parameter to trigger a 422 validation error
});

When(
  'I request nearby stations at latitude {float} and longitude {float}',
  async function (this: SolarWorld, lat: number, lng: number) {
    // {float} extracts decimal numbers from Gherkin: 6.9271 and 79.8612
    this.response = await request(app).get(`/api/stations/nearby?lat=${lat}&lng=${lng}`);
  },
);

When(
  'I request nearby stations with only latitude {float}',
  async function (this: SolarWorld, lat: number) {
    // Only lat, no lng — should trigger 422
    this.response = await request(app).get(`/api/stations/nearby?lat=${lat}`);
  },
);

When(
  'I request nearby stations with only longitude {float}',
  async function (this: SolarWorld, lng: number) {
    // Only lng, no lat — should trigger 422
    this.response = await request(app).get(`/api/stations/nearby?lng=${lng}`);
  },
);
```

---

#### Then steps (assertions — they check the response)

```typescript
Then(
  'the response status should be {int}',
  function (this: SolarWorld, expectedStatus: number) {
    const actual = this.response?.status;
    if (actual !== expectedStatus) {
      // Throws an error if the status doesn't match → Cucumber marks step as FAILED
      // The error includes the full response body to help diagnose the problem
      throw new Error(
        `Expected HTTP ${expectedStatus} but got ${actual}.\nBody: ${JSON.stringify(this.response?.body, null, 2)}`,
      );
    }
    // If no error is thrown → Cucumber marks step as PASSED
  },
);

Then('the response should contain a success true field', function (this: SolarWorld) {
  if (this.response?.body?.success !== true) {
    throw new Error(
      `Expected body.success to be true.\nBody: ${JSON.stringify(this.response?.body, null, 2)}`,
    );
  }
  // Checks that the standardized API response has { success: true }
});

Then('the response data should be an array', function (this: SolarWorld) {
  const data = this.response?.body?.data;
  if (!Array.isArray(data)) {
    throw new Error(
      `Expected body.data to be an array.\nBody: ${JSON.stringify(this.response?.body, null, 2)}`,
    );
  }
  // Checks that the response body has a 'data' field that is an array
});
```

**How pass/fail works**: In Cucumber, a step **passes** if its function completes without throwing. It **fails** if a `throw` (or an unhandled `async` rejection) occurs. There is no `expect()` or `assert()` library needed — a simple `if + throw` is sufficient.

---

## 5. How the Test Run Works Step by Step

When you run `npm run test:bdd`, this is what happens in order:

```
Step 1:  npm script sets TS_NODE_PROJECT=tsconfig.cucumber.json
         → ts-node will use our Cucumber TypeScript config

Step 2:  cucumber-js reads cucumber.js
         → Knows where features, steps, and support files are

Step 3:  ts-node/register is activated
         → TypeScript files can now be imported directly

Step 4:  env.setup.ts is loaded
         → All process.env variables are set

Step 5:  world.ts is loaded
         → SolarWorld class is registered with Cucumber

Step 6:  hooks.ts is loaded
         → BeforeAll / AfterAll / Before hooks are registered

Step 7:  stations.steps.ts is loaded
         → All Given / When / Then step definitions are registered

Step 8:  Cucumber reads stations.feature
         → Finds 7 scenarios, 26 total steps

Step 9:  BeforeAll hook runs
         → MongoMemoryReplSet starts (in-memory MongoDB)
         → seedCore() inserts roles, permissions, users, stations
         → Station.init() creates the 2dsphere spatial index

Step 10: For each of the 7 scenarios:
         a. Before hook resets World state
         b. Each Gherkin line is matched to a step function
         c. The function runs and either passes or throws
         d. Results are recorded

Step 11: AfterAll hook runs
         → In-memory DB is dropped and connection is closed

Step 12: Results are printed to terminal
         → HTML report is written to cucumber-report.html
```

---

## 6. Running the Tests

### Run all Cucumber BDD tests
```bash
npm run test:bdd
```

### What you will see in the terminal
```
...........................           ← Each dot = one passing step
7 scenarios (7 passed)
26 steps (26 passed)
0m03.211s (executing steps: 0m00.043s)
```

### View the HTML report
Open this file in your browser after running the tests:
```
src/tests/cucumber/reports/cucumber-report.html
```
The HTML report shows each scenario and step with green/red colouring and timing information.

### Run in combination with Jest tests
```bash
npm test                   # Unit tests (Jest)
npm run test:integration   # Integration tests (Jest)
npm run test:bdd           # BDD scenarios (Cucumber)
```

---

## 7. Reading the Results

### All passing
```
7 scenarios (7 passed)
26 steps (26 passed)
```

### With a failure
```
7 scenarios (1 failed, 6 passed)
26 steps (1 failed, 19 skipped, 6 passed)

Failures:
1) Scenario: List all active stations returns a successful response
   Step: Then the response status should be 200
   Error: Expected HTTP 200 but got 500.
   Body: { "success": false, "message": "Internal Server Error" }
```

When a step fails, all remaining steps in that scenario are **skipped** (shown as grey/skipped) because there is no point running assertions on a response that never arrived.

---

## 8. Gherkin Syntax Reference

| Keyword | Meaning |
|---------|---------|
| `Feature:` | Describes the overall feature being tested |
| `Scenario:` | One test case — a specific behaviour |
| `Given` | Pre-condition / initial state |
| `When` | The action being taken |
| `Then` | The expected outcome |
| `And` | Continues the previous Given / When / Then |
| `#` | Comment — ignored by Cucumber |

### Parameter types in step definitions

| Cucumber type | Matches in Gherkin | TypeScript type |
|---|---|---|
| `{int}` | Whole numbers: `5`, `1`, `200` | `number` |
| `{float}` | Decimal numbers: `6.9271`, `79.8612` | `number` |
| `{string}` | Quoted text: `"Colombo"`, `"admin"` | `string` |
| `{word}` | Single unquoted word | `string` |

---

## 9. Why These Specific Scenarios?

### Coverage Strategy

| Type | Scenarios | Purpose |
|------|-----------|---------|
| Happy path | 1, 2, 3, 5 | Verify the endpoint works correctly with valid input |
| Negative / validation | 4, 6, 7 | Verify the API correctly rejects invalid input |

### Why test validation (422) scenarios?

A good API must not just work for valid inputs — it must also **fail gracefully** for invalid inputs. Scenarios 4, 6, and 7 confirm that:
- Missing required parameters are caught by Joi validation middleware
- The server returns 422 (not 500 or 200 with wrong data)
- The application does not crash

### Why Colombo coordinates (6.9271, 79.8612)?

The seed data (`06_demo_stations.ts`) inserts demo stations located in Sri Lanka. Using nearby coordinates ensures the geospatial query will return results rather than an empty array.

---

## 10. Viva Talking Points

### "Why did you choose Cucumber over extending Jest?"

> Cucumber tests are readable by anyone — a business stakeholder, a lecturer, or a tester who doesn't know TypeScript can read the `.feature` file and understand exactly what is being tested. Jest tests require reading TypeScript code. BDD also forces us to think about behaviour from the user's perspective before writing implementation.

### "What does the World object do and why is it needed?"

> In Cucumber, each Gherkin line (Given/When/Then) is a completely separate function call. They share no variables by default. The World is a shared container object where step functions can read and write data — for example, the `When` step stores the HTTP response in `this.response`, and the `Then` step reads it. A new World instance is created for every single scenario, so no data leaks between tests.

### "What does BeforeAll do and why does it only run once?"

> Starting an in-memory MongoDB replica set and seeding data takes around 2–3 seconds. If we did that for every scenario, 7 scenarios would take 14–21 seconds just for setup. BeforeAll runs once before all tests, seeds the database, and all 7 scenarios share that data. The `Before` hook (no "All") resets only the World state before each scenario — a much cheaper operation.

### "What was the hardest bug to fix during setup?"

> The geospatial `/nearby` endpoint threw `$geoNear requires a 2dsphere index`. MongoDB creates indexes when a Mongoose model is first connected in a real environment, but the in-memory test database doesn't do this automatically. The fix was to explicitly call `Station.init()` in BeforeAll, which tells Mongoose to create all indexes on the in-memory DB before any tests run.

### "What is the difference between your Cucumber tests and your Jest integration tests?"

> The Jest integration tests tend to be more granular — they test individual service functions, error cases, edge cases, and internal logic in detail. The Cucumber BDD scenarios test from the HTTP layer outwards (just like a real user would), focusing only on the observable behaviour: what status code does the API return, and does the body have the right shape? Cucumber tests are wider but shallower; Jest tests are narrower but deeper.

### "How do you run the tests?"

> `npm run test:bdd` — after the run, a visual HTML report is generated at `src/tests/cucumber/reports/cucumber-report.html` which you can open in a browser to see all scenarios with green/red colouring and execution times.

---

*Generated for SE3010/SE3040 2026 Assignment · SolarSpot Backend*
