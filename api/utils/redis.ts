import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { Logger } from './logger.js';

// Environment variables
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const isRedisConfigured = Boolean(url && token);

let redisClient: Redis | null = null;
let ratelimiter: Ratelimit | null = null;

if (isRedisConfigured) {
  try {
    redisClient = new Redis({
      url: url!,
      token: token!,
    });

    ratelimiter = new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(120, '1 m'),
      analytics: true,
      prefix: 'chefos:ratelimit',
    });
    Logger.info('Upstash Redis initialized successfully for caching and rate limiting');
  } catch (err) {
    Logger.error('Failed to initialize Upstash Redis client, falling back to memory', err);
    redisClient = null;
    ratelimiter = null;
  }
} else {
  Logger.info('Upstash Redis env variables missing - using in-memory fallback for caching and rate limiting');
}

// Memory fallback store
const memoryCache = new Map<string, { value: any; expiresAt: number }>();
const memoryRateLimitMap = new Map<string, { count: number; resetTime: number }>();

/**
 * Distributed Rate Limiter with Upstash Redis + In-Memory Fallback
 */
export async function checkRateLimit(
  identifier: string,
  maxRequests: number = 120,
  windowSeconds: number = 60
): Promise<{ allowed: boolean; remaining: number; resetMs: number; isRedis: boolean }> {
  // If Redis Ratelimiter is available
  if (ratelimiter) {
    try {
      const result = await ratelimiter.limit(identifier);
      return {
        allowed: result.success,
        remaining: result.remaining,
        resetMs: Math.max(0, result.reset - Date.now()),
        isRedis: true,
      };
    } catch (err) {
      Logger.warn('Upstash Ratelimit failed, using memory fallback', err);
    }
  }

  // Memory Fallback
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const entry = memoryRateLimitMap.get(identifier);

  if (!entry || now > entry.resetTime) {
    memoryRateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetMs: windowMs, isRedis: false };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetMs: entry.resetTime - now, isRedis: false };
  }

  entry.count += 1;
  return { allowed: true, remaining: maxRequests - entry.count, resetMs: entry.resetTime - now, isRedis: false };
}

/**
 * Get item from Cache (Redis or Memory)
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const fullKey = `chefos:cache:${key}`;

  if (redisClient) {
    try {
      const data = await redisClient.get<T>(fullKey);
      if (data !== null && data !== undefined) {
        return data;
      }
    } catch (err) {
      Logger.warn(`Redis getCache failed for key ${key}, checking memory fallback`, err);
    }
  }

  // Fallback memory
  const entry = memoryCache.get(fullKey);
  if (entry) {
    if (Date.now() > entry.expiresAt) {
      memoryCache.delete(fullKey);
      return null;
    }
    return entry.value as T;
  }

  return null;
}

/**
 * Set item in Cache (Redis or Memory)
 */
export async function setCache<T>(key: string, value: T, ttlSeconds: number = 300): Promise<void> {
  const fullKey = `chefos:cache:${key}`;

  if (redisClient) {
    try {
      if (ttlSeconds > 0) {
        await redisClient.set(fullKey, value, { ex: ttlSeconds });
      } else {
        await redisClient.set(fullKey, value);
      }
    } catch (err) {
      Logger.warn(`Redis setCache failed for key ${key}, saving to memory fallback`, err);
    }
  }

  // Save to memory cache as well for ultra-fast local fallback
  memoryCache.set(fullKey, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Delete single or multiple keys from Cache
 */
export async function deleteCache(keys: string | string[]): Promise<void> {
  const keyList = Array.isArray(keys) ? keys : [keys];
  const fullKeys = keyList.map((k) => `chefos:cache:${k}`);

  if (redisClient && fullKeys.length > 0) {
    try {
      await redisClient.del(...fullKeys);
    } catch (err) {
      Logger.warn(`Redis deleteCache failed`, err);
    }
  }

  fullKeys.forEach((k) => memoryCache.delete(k));
}

/**
 * Invalidate cache keys matching pattern (e.g. "catalog:*", "restaurant:123:*")
 */
export async function invalidateCachePattern(pattern: string): Promise<void> {
  const fullPattern = `chefos:cache:${pattern}`;

  if (redisClient) {
    try {
      const keys = await redisClient.keys(fullPattern);
      if (keys && keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (err) {
      Logger.warn(`Redis invalidateCachePattern failed for pattern ${pattern}`, err);
    }
  }

  // Memory fallback invalidation
  const regex = new RegExp('^' + fullPattern.replace(/\*/g, '.*') + '$');
  for (const k of memoryCache.keys()) {
    if (regex.test(k)) {
      memoryCache.delete(k);
    }
  }
}

/**
 * Cache Wrapper function - fetch and cache pattern
 */
export async function remember<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await getCache<T>(key);
  if (cached !== null) {
    return cached;
  }

  const freshData = await fetcher();
  if (freshData !== null && freshData !== undefined) {
    await setCache(key, freshData, ttlSeconds);
  }

  return freshData;
}
