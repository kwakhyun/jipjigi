import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryObserver } from "@tanstack/react-query";
import { createQueryClient, isSessionError } from "./client";
import { ownerKeys } from "./keys";
import { ownerResourceOptions } from "./options";
import { affectedResources, invalidateOwnerResources } from "./invalidation";

afterEach(() => vi.unstubAllGlobals());

describe("운영 데이터 캐시 정책", () => {
  it.each([
    ["mark_payment", ["ledger", "briefing"]],
    ["update_maintenance", ["maintenance", "briefing"]],
    ["start_renewal", ["messages", "contracts", "ledger", "briefing"]],
    ["send_overdue_notice", ["messages", "contracts", "ledger", "briefing"]],
    ["retry_message", ["messages", "contracts", "ledger", "briefing"]],
  ] as const)("%s의 변경 영향 범위를 한곳에서 정의한다", (operation, resources) => {
    expect(affectedResources(operation)).toEqual(resources);
  });

  it("활성 목록은 다시 읽고 비활성 목록은 무효화하되 다른 계정은 건드리지 않는다", async () => {
    const client = createQueryClient();
    const ledger = ownerKeys.resource("owner-1", "ledger");
    const briefing = ownerKeys.briefing("owner-1", "building-1");
    const otherOwner = ownerKeys.resource("owner-2", "ledger");
    client.setQueryData(ledger, ["old"]);
    client.setQueryData(briefing, "old-briefing");
    client.setQueryData(otherOwner, ["private"]);
    const read = vi.fn(async () => ["server-confirmed"]);
    const observer = new QueryObserver(client, { queryKey: ledger, queryFn: read });
    const unsubscribe = observer.subscribe(() => {});
    expect(read).not.toHaveBeenCalled();
    await invalidateOwnerResources(client, "owner-1", affectedResources("mark_payment"));
    expect(read).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(ledger)).toEqual(["server-confirmed"]);
    expect(client.getQueryState(briefing)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherOwner)?.isInvalidated).toBe(false);
    unsubscribe(); client.clear();
  });

  it("요청 취소 신호를 전달하고 다른 탭에서 계정이 바뀐 응답은 캐시에 넣지 않는다", async () => {
    const client = createQueryClient();
    const fetch = vi.fn(async () => Response.json({ ownerId: "owner-2", data: ["private"] }));
    vi.stubGlobal("fetch", fetch);
    let error: unknown;
    try { await client.fetchQuery(ownerResourceOptions("owner-1", "contracts")); } catch (caught) { error = caught; }
    expect(isSessionError(error)).toBe(true);
    expect(client.getQueryData(ownerKeys.resource("owner-1", "contracts"))).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/workspace/contracts", expect.objectContaining({ signal: expect.any(AbortSignal), cache: "no-store" }));
    client.clear();
  });

  it.each([[400, 1], [429, 1], [503, 2]])("조회 HTTP %s는 총 %s회까지만 시도한다", async (status, attempts) => {
    const client = createQueryClient();
    const fetch = vi.fn(async () => new Response(null, { status }));
    vi.stubGlobal("fetch", fetch);
    await expect(client.fetchQuery({ ...ownerResourceOptions("owner-1", "contracts"), retryDelay: 0 })).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(attempts);
    client.clear();
  });
});
