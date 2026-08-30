/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ownerQueryHarness } from "@/lib/query/test-harness";
import { ownerKeys } from "@/lib/query/keys";
import { ownerResourceOptions } from "@/lib/query/options";
import { useOwnerId } from "@/lib/query/owner-context";
vi.mock("server-only", () => ({}));
import { QueryHydration } from "./query-hydration";
import { Providers } from "./providers";

function Count() {
  const query = useQuery(ownerResourceOptions(useOwnerId(), "contracts"));
  return <span>계약 {query.data?.length ?? 0}건</span>;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("SSR 데이터 인계와 계정 범위", () => {
  it("서버에서 준비한 데이터로 첫 화면을 만들고 즉시 중복 조회하지 않는다", () => {
    const query = ownerQueryHarness();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<QueryHydration entries={[{ queryKey: ownerKeys.resource("owner-1", "contracts"), data: [{ id: "lease-1" }] }]}><Count /></QueryHydration>, { wrapper: query.Wrapper });
    expect(screen.getByText("계약 1건")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("더 최근의 서버 응답은 이미 존재하는 클라이언트 캐시에도 반영된다", async () => {
    const query = ownerQueryHarness();
    const key = ownerKeys.resource("owner-1", "contracts");
    query.client.setQueryData(key, [], { updatedAt: Date.now() - 1000 });
    render(<QueryHydration entries={[{ queryKey: key, data: [{ id: "lease-2" }] }]}><Count /></QueryHydration>, { wrapper: query.Wrapper });
    await waitFor(() => expect(screen.getByText("계약 1건")).toBeTruthy());
    expect(query.client.getQueryData(key)).toEqual([{ id: "lease-2" }]);
  });

  it("같은 계정의 화면 이동에는 캐시를 유지하고 계정 키가 바뀌면 새로 만든다", () => {
    let current!: QueryClient;
    function Probe() { current = useQueryClient(); return <span>{useOwnerId()}</span>; }
    const view = render(<Providers key="owner-1" ownerId="owner-1"><Probe /></Providers>);
    const first = current;
    const key = ownerKeys.resource("owner-1", "ledger");
    first.setQueryData(key, ["private"]);
    view.rerender(<Providers key="owner-1" ownerId="owner-1"><Probe /></Providers>);
    expect(current).toBe(first);
    view.rerender(<Providers key="owner-2" ownerId="owner-2"><Probe /></Providers>);
    expect(current).not.toBe(first);
    expect(current.getQueryData(key)).toBeUndefined();
    first.clear(); current.clear();
  });
});
