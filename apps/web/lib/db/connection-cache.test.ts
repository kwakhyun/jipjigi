import { afterEach, expect, it, vi } from "vitest";
import { ConnectionCache } from "./connection-cache";

afterEach(() => vi.useRealTimers());

it("동시 연결을 공유하고 실패 후 쿨다운이 지나면 새 연결로 복구한다", async () => {
  vi.useFakeTimers();
  const create = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("connected");
  const dispose = vi.fn(async () => undefined);
  const cache = new ConnectionCache(create, dispose);
  const first = cache.get();
  expect(cache.get()).toBe(first);
  await expect(first).rejects.toThrow("offline");
  await expect(cache.get()).rejects.toThrow("offline");
  expect(create).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1_000);
  await expect(cache.get()).resolves.toBe("connected");
  expect(create).toHaveBeenCalledTimes(2);
  await cache.close();
  expect(dispose).toHaveBeenCalledExactlyOnceWith("connected");
  await expect(cache.get()).resolves.toBe("connected");
  expect(create).toHaveBeenCalledTimes(3);
});

it("실패한 연결을 닫은 뒤에는 대기 없이 다시 시도한다", async () => {
  const create = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(1);
  const cache = new ConnectionCache(create, async () => undefined);
  await expect(cache.get()).rejects.toThrow("offline");
  await cache.close();
  await expect(cache.get()).resolves.toBe(1);
});
