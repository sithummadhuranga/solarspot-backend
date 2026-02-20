import NodeCache from 'node-cache';

/**
 * In-memory cache backed by node-cache.
 * Default TTL: 15 minutes (900 seconds).
 * Use Redis in production for a distributed setup.
 */
const cache = new NodeCache({ stdTTL: 900, checkperiod: 120 });

/**
 * cacheGet — retrieve a cached value by key.
 * Returns undefined if the key is not cached or has expired.
 */
export function cacheGet<T = unknown>(key: string): T | undefined {
  // TODO: add logging / metrics
  return cache.get<T>(key);
}

/**
 * cacheSet — store a value in the cache.
 * @param ttl — optional TTL in seconds (defaults to 900)
 */
export function cacheSet<T = unknown>(key: string, value: T, ttl?: number): boolean {
  // TODO: add logging / metrics
  return ttl !== undefined ? cache.set(key, value, ttl) : cache.set(key, value);
}

/**
 * cacheDel — delete a key from the cache.
 */
export function cacheDel(key: string): number {
  // TODO: add logging / metrics
  return cache.del(key);
}

/** Expose cache stats for the admin endpoint */
export function cacheStats(): NodeCache.Stats {
  return cache.getStats();
}
