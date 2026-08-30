/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardSnapshot } from "@jipjigi/domain";
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ initialData }: { initialData: unknown }) => ({ data: initialData, isFetching: false }) }));
vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));
import { DashboardView } from "./dashboard-view";

const snapshot: DashboardSnapshot = {
  generatedAt: "2026-08-31T00:00:00.000Z", hasMutedBriefings: false,
  building: { id: "building-1", name: "가상 건물", address: "가상 주소", totalUnits: 3, occupiedUnits: 2 },
  metrics: { collectionRate: 50, collectedAmount: 500000, expectedAmount: 1000000, occupiedRate: 66.7, openMaintenance: 0 },
  briefing: { renewal: { leaseId: "lease-501", unitName: "501호", tenantName: "김가상", daysLeft: 30, currentDeposit: 10000000, currentRent: 500000, suggestedRent: 520000, status: "attention" }, overdue: { chargeId: "charge-203", unitName: "203호", tenantName: "이가상", amount: 500000, daysOverdue: 3, noticeStatus: "not_sent" }, maintenance: null }, recentActivities: [],
};
afterEach(cleanup);
function view(data = snapshot) { return <DashboardView initial={{ data, experiment: { key: "home_briefing_priority_v1", variant: "risk-first" } }} buildings={[snapshot.building]} userName="데모" />; }

describe("홈의 근거와 발송 진입점", () => {
  it("조정 예시를 시세로 표현하지 않고 미리보기 링크를 제공한다", () => {
    render(view());
    expect(screen.queryByText(/주변 시세를 반영/)).toBeNull();
    expect(screen.getByText(/시세 조회나 권장 금액이 아닌 데모 계산 예시/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "갱신 안내 문구 확인" }).getAttribute("href")).toBe("/app/messages?target=lease-501");
    expect(screen.getByRole("link", { name: "안내 확인" }).getAttribute("href")).toBe("/app/messages?target=charge-203");
  });
  it("숨긴 알림을 특이 사항 없음으로 안내하지 않는다", () => {
    render(view({ ...snapshot, hasMutedBriefings: true, briefing: { renewal: null, overdue: null, maintenance: null } }));
    expect(screen.getByText("설정에서 선택한 항목만 표시하고 있어요")).toBeTruthy();
    expect(screen.queryByText(/특이 사항 없이 운영 중/)).toBeNull();
  });
});
