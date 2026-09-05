/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContractRow, LedgerRow, MessageRow } from "@/lib/data/types";
const { submit } = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@/lib/operations/client", () => ({ submitOperation: submit }));
import { MessagesView } from "./messages-view";
import { ownerQueryHarness } from "@/lib/query/test-harness";

const contracts: ContractRow[] = [{ id: "lease-501", unitName: "501호", tenantName: "김가상", tenantPhoneMasked: "010-****-0000", startDate: "2025-09-01", endDate: "2026-09-30", depositAmount: 10000000, monthlyRent: 500000, renewalStatus: "attention", buildingName: "가상 건물", timeline: [] }];
const charges: LedgerRow[] = [{ id: "charge-203", period: "2026-08", dueDate: "2026-08-20", amount: 500000, status: "overdue", paidAt: null, unitName: "203호", tenantName: "이가상", buildingName: "가상 건물" }];
function harness(messages: MessageRow[] = []) { return ownerQueryHarness({ messages, contracts, ledger: charges, preferences: { rentReminder: true, renewalReminder: true, maintenanceUpdates: true, marketing: false, quietHoursStart: "22:30", quietHoursEnd: "09:15" } }); }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
beforeEach(() => { submit.mockReset(); });

describe("발송 전 공통 미리보기", () => {
  it("예약 시각과 차단 이유를 본문으로 구분해 안내한다", () => {
    const message: MessageRow = { id: "scheduled", entityType: "lease", entityId: "lease-501", channel: "sandbox_alimtalk", templateKey: "renewal_v1", status: "scheduled", guardrailReason: "quiet_hours", scheduledFor: "2026-09-01T00:15:00Z", createdAt: "2026-08-31T13:30:00Z", updatedAt: "2026-08-31T13:30:00Z", deliveredAt: null, retryCount: 0 };
    const { container } = render(<MessagesView />, { wrapper: harness([message, { ...message, id: "blocked", status: "blocked", guardrailReason: "missing_consent", scheduledFor: null }]).Wrapper });
    expect(container.querySelector('time[datetime="2026-09-01T00:15:00Z"]')?.closest("div")?.textContent).toContain("예약");
    expect(screen.getByText(/임차인의 수신 동의가 없어 차단했어요/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "발송 시간 설정" }).getAttribute("href")).toBe("/app/settings");
  });
  it("진입 대상의 문구를 먼저 표시하고 명시적인 접수 때만 서버를 호출한다", async () => {
    const query = harness();
    submit.mockImplementation(async () => {
      query.resources.messages = [{ id: "message-1", entityType: "lease", entityId: "lease-501", channel: "sandbox_alimtalk", templateKey: "renewal_v1", status: "delivered", guardrailReason: null, scheduledFor: null, createdAt: "2026-08-31T01:00:00Z", updatedAt: "2026-08-31T01:00:01Z", deliveredAt: "2026-08-31T01:00:01Z", retryCount: 0 }];
      query.resources.contracts = contracts.map((contract) => ({ ...contract, renewalStatus: "requested" }));
      return { id: "message-1", status: "accepted", guardrailReason: null, scheduledFor: null, duplicate: false, retryCount: 0 };
    });
    vi.stubGlobal("fetch", query.fetch);
    render(<MessagesView initialTargetId="lease-501" />, { wrapper: query.Wrapper });
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("lease-501");
    expect(screen.getByText(/김가상님, 계약 만료일이/)).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "발송 조건 확인 후 접수" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ type: "start_renewal", leaseId: "lease-501" }));
    await screen.findByText("테스트 메시지를 접수했어요.");
    expect(screen.getAllByText("전달")).toHaveLength(2);
    expect(screen.getByText("선택한 대상에 보낼 메시지가 없어요.")).toBeTruthy();
  });

  it("유효하지 않은 대상은 다른 임차인으로 자동 대체하지 않는다", () => {
    render(<MessagesView initialTargetId="not-owned-or-finished" />, { wrapper: harness().Wrapper });
    expect(screen.getByText("선택한 대상에 보낼 메시지가 없어요.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "발송 조건 확인 후 접수" }) as HTMLButtonElement).disabled).toBe(true);
    expect(submit).not.toHaveBeenCalled();
  });

  it("서버에서 받은 시간 설정과 예약의 데모 범위를 안내한다", () => {
    render(<MessagesView />, { wrapper: harness().Wrapper });
    expect(screen.getByText("발송 제한 22:30~09:15 (한국 시간)")).toBeTruthy();
    expect(screen.getByText(/자동 발송은 실행되지 않습니다/)).toBeTruthy();
  });

  it("런타임의 한국어 로케일이 AM을 반환해도 발송 시각을 동일한 한국어로 표시한다", () => {
    // CI's Node ICU formatted ko-KR with AM, while Chromium used 오전.
    // format is a runtime getter, although TypeScript declares it as a method.
    const dateTimePrototype: { readonly format: unknown } = Intl.DateTimeFormat.prototype;
    vi.spyOn(dateTimePrototype, "format", "get").mockReturnValue(() => "8월 31일 AM 10:00");
    const messages: MessageRow[] = [{ id: "message-1", entityType: "lease", entityId: "lease-501", channel: "sandbox_alimtalk", templateKey: "renewal_v1", status: "delivered", guardrailReason: null, scheduledFor: null, createdAt: "2026-08-31T01:00:00Z", updatedAt: "2026-08-31T01:00:01Z", deliveredAt: "2026-08-31T01:00:01Z", retryCount: 0 }];
    render(<MessagesView />, { wrapper: harness(messages).Wrapper });
    expect(screen.getAllByText("8월 31일 오전 10:00")).toHaveLength(2);
  });
});
