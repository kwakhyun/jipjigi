import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { rateLimit, rateLimitStore } from "./request";

describe("rateLimit", () => {
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const previousVercelEnvironment = process.env.VERCEL_ENV;

  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
    if (previousVercelEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnvironment;
  });

  it("로컬 저장소에서 한도를 적용하고 윈도우가 지나면 복구한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T00:00:00.000Z"));
    const key = `test:${crypto.randomUUID()}`;

    expect(await rateLimit(key, 2, 1_000)).toMatchObject({ allowed: true, remaining: 1, store: "memory" });
    expect(await rateLimit(key, 2, 1_000)).toMatchObject({ allowed: true, remaining: 0, store: "memory" });
    expect(await rateLimit(key, 2, 1_000)).toMatchObject({ allowed: false, remaining: 0, store: "memory" });

    vi.advanceTimersByTime(1_001);
    expect(await rateLimit(key, 2, 1_000)).toMatchObject({ allowed: true, remaining: 1, store: "memory" });
  });

  it("Redis 자격 증명 두 개가 모두 있을 때 분산 모드를 선택한다", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

    expect(rateLimitStore()).toBe("redis");
  });

  it("운영 환경에 Redis가 없으면 요청을 허용하지 않는다", async () => {
    process.env.VERCEL_ENV = "production";

    expect(rateLimitStore()).toBe("unavailable");
    expect(await rateLimit(`production:${crypto.randomUUID()}`, 2, 1_000)).toMatchObject({
      allowed: false,
      remaining: 0,
      store: "unavailable",
    });
  });
});
