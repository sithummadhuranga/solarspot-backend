/**
 * Unit tests — WeatherService
 * Owner: Member 3 — implement tests.
 * Ref: MASTER_PROMPT.md → Testing → mock axios/http, mock QuotaService, mock WeatherCache
 */

describe('WeatherService', () => {
  describe('getCurrentWeather', () => {
    it.todo('should return cached data if fresh (< 30 min)');
    it.todo('should fetch from OWM API on cache miss');
    it.todo('should throw 429 if quota exceeded');
    it.todo('should persist to WeatherCache after successful fetch');
  });

  describe('getForecast', () => {
    it.todo('should return 5-day forecast as ForecastSlot[]');
  });

  describe('getBestTimes', () => {
    it.todo('should score and rank forecast slots');
    it.todo('should return top N slots sorted by solar score');
  });

  describe('getSolarHeatmap', () => {
    it.todo('should aggregate solar index across all active stations');
  });

  describe('bulkRefresh', () => {
    it.todo('should refresh cache for requested station IDs');
    it.todo('should return { refreshed, failed } counts');
  });
});
