import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 900, checkperiod: 120 });

export function cacheGet<T = unknown>(key: string): T | undefined {
  return cache.get<T>(key);
}

export function cacheSet<T = unknown>(key: string, value: T, ttl?: number): boolean {
  return ttl !== undefined ? cache.set(key, value, ttl) : cache.set(key, value);
}

export function cacheDel(key: string): number {
  return cache.del(key);
}

export function cacheStats(): NodeCache.Stats {
  return cache.getStats();
}
