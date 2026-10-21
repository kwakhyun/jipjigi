import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { redisOptions, ping } = vi.hoisted(() => ({ redisOptions: vi.fn(), ping: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(options: unknown) { redisOptions(options); }
    ping = ping;
  },
}));

import { rateLimit, rateLimitHealth, rateLimitStore } from "./request";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    vi.stubEnv("KV_REST_API_URL", undefined);
    vi.stubEnv("KV_REST_API_TOKEN", undefined);
    vi.stubEnv("VERCEL_ENV", "test");
    vi.useFakeTimers();
    redisOptions.mockClear();
    ping.mockReset().mockResolvedValue("PONG");
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("로컬 저장소에서 한도를 적용하고 윈도우가 지나면 복구한다", async () => {
    vi.setSystemTime(new Date("2026-08-30T00:00:00.000Z"));
    const key = `test:${crypto.randomUUID()}`;

    expect(await rateLimit(key, 2, 1_000)).toMatchObject({ allowed: true, remaining: 1, store: "memory" });
    expect(await rateLimit(key, 2, 1_000)).toMatchObject({ allowed: true, remaining: 0, store: "memory" });
    expect(await rateLimit(key, 2, 1_000)).toMatchObject({ allowed: false, remaining: 0, store: "memory" });

    vi.advanceTimersByTime(1_001);
    expect(await rateLimit(key, 2, 1_000)).toMatchObject({ allowed: true, remaining: 1, store: "memory" });
  });

  it("Redis 자격 증명 두 개가 모두 있을 때 분산 모드를 선택한다", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

    expect(rateLimitStore()).toBe("redis");
    expect(await rateLimitHealth()).toBe(true);
    expect(redisOptions).toHaveBeenCalledWith({ url: "https://example.upstash.io", token: "test-token" });
  });

  it("두 공급자가 모두 설정되면 공백을 제거한 Upstash 인증 쌍을 우선한다", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "  https://example.upstash.io  ";
    process.env.UPSTASH_REDIS_REST_TOKEN = "  upstash-token  ";
    process.env.KV_REST_API_URL = "https://example-kv.upstash.io";
    process.env.KV_REST_API_TOKEN = "kv-token";

    expect(await rateLimitHealth()).toBe(true);
    expect(redisOptions).toHaveBeenCalledWith({ url: "https://example.upstash.io", token: "upstash-token" });
  });

  it.each(["", " \t "])("Upstash 값이 비어 있으면 KV 인증 쌍을 사용한다 (%j)", async (empty) => {
    process.env.UPSTASH_REDIS_REST_URL = empty;
    process.env.UPSTASH_REDIS_REST_TOKEN = empty;
    process.env.KV_REST_API_URL = "  https://example-kv.upstash.io  ";
    process.env.KV_REST_API_TOKEN = "  kv-token  ";
    process.env.VERCEL_ENV = "production";

    expect(rateLimitStore()).toBe("redis");
    expect(await rateLimitHealth()).toBe(true);
    expect(redisOptions).toHaveBeenCalledWith({ url: "https://example-kv.upstash.io", token: "kv-token" });
  });

  it.each(["url", "token"])("Upstash의 %s만 있으면 완전한 KV 인증 쌍을 사용한다", async (present) => {
    if (present === "url") process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    else process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";
    process.env.KV_REST_API_URL = "https://example-kv.upstash.io";
    process.env.KV_REST_API_TOKEN = "kv-token";

    expect(await rateLimitHealth()).toBe(true);
    expect(redisOptions).toHaveBeenCalledWith({ url: "https://example-kv.upstash.io", token: "kv-token" });
  });

  it.each(["url", "token"])("다른 공급자의 %s와 나머지 인증 값을 섞지 않고 운영 요청을 거부한다", async (present) => {
    if (present === "url") {
      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
      process.env.KV_REST_API_TOKEN = "kv-token";
    } else {
      process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";
      process.env.KV_REST_API_URL = "https://example-kv.upstash.io";
    }
    process.env.VERCEL_ENV = "production";

    expect(rateLimitStore()).toBe("unavailable");
    expect(await rateLimitHealth()).toBe(false);
    expect(await rateLimit(`incomplete:${crypto.randomUUID()}`, 2, 1_000)).toMatchObject({
      allowed: false,
      remaining: 0,
      store: "unavailable",
    });
    expect(redisOptions).not.toHaveBeenCalled();
  });

  it("로컬에서는 불완전한 인증 설정을 메모리 저장소로 대체한다", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.KV_REST_API_TOKEN = "kv-token";

    expect(rateLimitStore()).toBe("memory");
    expect(await rateLimitHealth()).toBe(true);
    expect(await rateLimit(`local-incomplete:${crypto.randomUUID()}`, 2, 1_000)).toMatchObject({
      allowed: true,
      remaining: 1,
      store: "memory",
    });
    expect(redisOptions).not.toHaveBeenCalled();
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
