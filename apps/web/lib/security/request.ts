import "server-only";

import { createHash } from "node:crypto";
import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { logger } from "@/lib/observability/logger";

const buckets = new Map<string, { count: number; resetAt: number }>();
const distributedLimiters = new Map<string, Ratelimit>();
const MAX_BUCKETS = 10_000;
const REDIS_TIMEOUT_MS = 1_500;
let lastRedisWarningAt = 0;

function makeRoom(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  while (buckets.size >= MAX_BUCKETS) {
    const oldestKey = buckets.keys().next().value as string | undefined;
    if (!oldestKey) break;
    buckets.delete(oldestKey);
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return;
  const parsed = new URL(origin);
  if (parsed.host !== host) throw new Error("INVALID_ORIGIN");
}

function memoryRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    if (!existing && buckets.size >= MAX_BUCKETS) makeRoom(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs, store: "memory" as const };
  }
  if (existing.count >= limit) return { allowed: false, remaining: 0, resetAt: existing.resetAt, store: "memory" as const };
  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt, store: "memory" as const };
}

function redisConfiguration() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

function distributedLimiter(limit: number, windowMs: number) {
  const key = `${limit}:${windowMs}`;
  const existing = distributedLimiters.get(key);
  if (existing) return existing;

  const configuration = redisConfiguration();
  if (!configuration) return null;
  const limiter = new Ratelimit({
    redis: new Redis(configuration),
    limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms` as Duration),
    prefix: "jipjigi:rate-limit",
    analytics: false,
    timeout: REDIS_TIMEOUT_MS,
  });
  distributedLimiters.set(key, limiter);
  return limiter;
}

function warnRedisFailure(error: unknown) {
  const now = Date.now();
  if (now - lastRedisWarningAt < 60_000) return;
  lastRedisWarningAt = now;
  logger.warn("rate_limit.redis_fallback", {
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
}

export function rateLimitStore() {
  return redisConfiguration() ? "redis" as const : "memory" as const;
}

export async function rateLimit(key: string, limit = 30, windowMs = 60_000) {
  const limiter = distributedLimiter(limit, windowMs);
  if (!limiter) return memoryRateLimit(key, limit, windowMs);

  try {
    const identifier = createHash("sha256").update(key).digest("hex");
    const result = await limiter.limit(identifier);
    if (result.reason === "timeout") {
      warnRedisFailure(new Error("UPSTASH_TIMEOUT"));
      return memoryRateLimit(key, limit, windowMs);
    }
    return {
      allowed: result.success,
      remaining: result.remaining,
      resetAt: result.reset,
      store: "redis" as const,
    };
  } catch (error) {
    warnRedisFailure(error);
    return memoryRateLimit(key, limit, windowMs);
  }
}
