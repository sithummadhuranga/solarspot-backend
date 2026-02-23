/**
 * Integration tests — Weather endpoints
 * Owner: Member 3 — implement.
 * Note: mock HTTP calls to OWM API; use nock or jest.mock
 */

describe('GET /api/stations/:id/weather', () => {
  it.todo('200 — returns current weather from cache');
  it.todo('200 — fetches from OWM on cache miss');
  it.todo('429 — quota exceeded');
});

describe('GET /api/stations/:id/forecast', () => {
  it.todo('200 — returns 5-day forecast');
});

describe('GET /api/stations/:id/best-times', () => {
  it.todo('200 — returns sorted best-time slots');
});

describe('GET /api/weather/heatmap', () => {
  it.todo('200 — returns heatmap point array');
});

describe('POST /api/admin/weather/refresh', () => {
  it.todo('200 — admin can bulk refresh');
  it.todo('403 — non-admin cannot refresh');
});

describe('GET /api/admin/weather/export', () => {
  it.todo('200 — returns JSON export');
  it.todo('200 — returns CSV export when format=csv');
});
