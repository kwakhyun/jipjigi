/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContractRow, LedgerRow } from "@/lib/data/repository";
const { submit } = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@/lib/operations/client", () => ({ submitOperation: submit }));
import { MessagesView } from "./messages-view";

const contracts: ContractRow[] = [{ id: "lease-501", unitName: "501호", tenantName: "김가상", tenantPhoneMasked: "010-****-0000", startDate: "2025-09-01", endDate: "2026-09-30", depositAmount: 10000000, monthlyRent: 500000, renewalStatus: "attention", buildingName: "가상 건물", timeline: [] }];
const charges: LedgerRow[] = [{ id: "charge-203", period: "2026-08", dueDate: "2026-08-20", amount: 500000, status: "overdue", paidAt: null, unitName: "203호", tenantName: "이가상", buildingName: "가상 건물" }];
const props = { initialMessages: [], contracts, charges, quietHours: { start: "22:30", end: "09:15" } };
afterEach(cleanup);
beforeEach(() => submit.mockReset());

describe("발송 전 공통 미리보기", () => {
  it("진입 대상의 문구를 먼저 표시하고 명시적인 접수 때만 서버를 호출한다", async () => {
    submit.mockResolvedValue({ id: "message-1", status: "accepted", guardrailReason: null, scheduledFor: null, duplicate: false, retryCount: 0 });
    render(<MessagesView {...props} initialTargetId="lease-501" />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("lease-501");
    expect(screen.getByText(/김가상님, 계약 만료일이/)).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "발송 조건 확인 후 접수" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ type: "start_renewal", leaseId: "lease-501" }));
  });

  it("유효하지 않은 대상은 다른 임차인으로 자동 대체하지 않는다", () => {
    render(<MessagesView {...props} initialTargetId="not-owned-or-finished" />);
    expect(screen.getByText("선택한 대상에 보낼 메시지가 없어요.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "발송 조건 확인 후 접수" }) as HTMLButtonElement).disabled).toBe(true);
    expect(submit).not.toHaveBeenCalled();
  });

  it("서버에서 받은 시간 설정과 예약의 데모 범위를 안내한다", () => {
    render(<MessagesView {...props} />);
    expect(screen.getByText("발송 제한 22:30~09:15 (한국 시간)")).toBeTruthy();
    expect(screen.getByText(/자동 발송은 실행되지 않습니다/)).toBeTruthy();
  });
});
