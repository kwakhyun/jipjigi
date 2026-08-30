/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerRow } from "@/lib/data/repository";
import { ownerQueryHarness } from "@/lib/query/test-harness";
import { ownerKeys } from "@/lib/query/keys";

const { submit } = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@/lib/operations/client", () => ({ submitOperation: submit }));
import { LedgerView } from "./ledger/ledger-view";
import { MessagesView } from "./messages/messages-view";

const charge: LedgerRow = { id: "charge-203", period: "2026-08", dueDate: "2026-08-20", amount: 500000, status: "overdue", paidAt: null, unitName: "203호", tenantName: "이가상", buildingName: "가상 건물" };
const preferences = { rentReminder: true, renewalReminder: true, maintenanceUpdates: true, marketing: false, quietHoursStart: "21:00", quietHoursEnd: "08:00" };
beforeEach(() => { submit.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("실제 Query 캐시를 사용하는 운영 화면", () => {
  it("입금은 서버 확인 뒤 반영하고 공유 중인 메시지 대상과 브리핑 캐시도 갱신한다", async () => {
    const query = ownerQueryHarness({ ledger: [charge], messages: [], contracts: [], preferences });
    const read = vi.fn(query.fetch);
    vi.stubGlobal("fetch", read);
    const briefingKey = ownerKeys.briefing("owner-1", "building-1");
    query.client.setQueryData(briefingKey, { old: true });
    let confirm!: () => void;
    const confirmation = new Promise<void>((resolve) => { confirm = resolve; });
    const paid = { ...charge, status: "paid" as const, paidAt: "2026-08-31T03:12:34.000Z" };
    submit.mockImplementation(async () => {
      await confirmation;
      query.resources.ledger = [paid];
      return { status: "updated" };
    });
    render(<><LedgerView /><MessagesView initialTargetId={charge.id} /></>, { wrapper: query.Wrapper });
    expect(read).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "입금 확인" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(query.client.getQueryData(ownerKeys.resource("owner-1", "ledger"))).toEqual([charge]);
    expect((screen.getByRole("button", { name: "확인 중…" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => confirm());
    await screen.findByText("203호의 입금을 확인하고 납부 완료로 반영했어요.");
    expect(query.client.getQueryData(ownerKeys.resource("owner-1", "ledger"))).toEqual([paid]);
    expect(query.client.getQueryState(briefingKey)?.isInvalidated).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
    expect(screen.getByText("선택한 대상에 보낼 메시지가 없어요.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "발송 조건 확인 후 접수" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("변경 실패를 자동 재실행하거나 납부 완료로 표시하지 않는다", async () => {
    const query = ownerQueryHarness({ ledger: [charge] });
    vi.stubGlobal("fetch", query.fetch);
    submit.mockRejectedValue(new Error("입금을 확인하지 못했습니다."));
    render(<LedgerView />, { wrapper: query.Wrapper });
    fireEvent.click(screen.getByRole("button", { name: "입금 확인" }));
    await waitFor(() => expect(screen.queryByText("입금을 확인하지 못했습니다.")).toBeTruthy());
    expect(submit).toHaveBeenCalledTimes(1);
    expect(query.client.getQueryData(ownerKeys.resource("owner-1", "ledger"))).toEqual([charge]);
    expect(screen.getByRole("button", { name: "입금 확인" })).toBeTruthy();
  });

  it("재조회 실패에는 기존 목록과 오류를 표시하고 수동 새로고침으로 복구한다", async () => {
    const query = ownerQueryHarness({ ledger: [charge] });
    const read = vi.fn().mockResolvedValueOnce(new Response(null, { status: 500 })).mockImplementation(query.fetch);
    vi.stubGlobal("fetch", read);
    render(<LedgerView />, { wrapper: query.Wrapper });
    fireEvent.click(screen.getByRole("button", { name: "임대 장부 새로고침" }));
    expect((await screen.findByRole("alert")).textContent).toContain("최신 정보를 불러오지 못했어요");
    expect(screen.getByText("이가상")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "임대 장부 새로고침" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("세션이 만료되면 캐시에 남은 임차인 정보를 숨기고 로그인을 안내한다", async () => {
    const query = ownerQueryHarness({ ledger: [charge] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    render(<LedgerView />, { wrapper: query.Wrapper });
    fireEvent.click(screen.getByRole("button", { name: "임대 장부 새로고침" }));
    expect((await screen.findByRole("alert")).textContent).toContain("로그인 상태가 변경됐어요");
    expect(screen.queryByText("이가상")).toBeNull();
    expect(screen.getByRole("link", { name: "로그인 확인" }).getAttribute("href")).toBe("/login");
  });
});
