/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const submitOperation = vi.hoisted(() => vi.fn());
const track = vi.hoisted(() => vi.fn());

vi.mock("@/lib/operations/client", () => ({ submitOperation }));
vi.mock("@/lib/analytics/client", () => ({ track }));

import { MaintenanceView } from "./maintenance-view";
import { ownerQueryHarness } from "@/lib/query/test-harness";

const request = {
  id: "maintenance-302",
  unitName: "302호",
  buildingName: "성수 리버하임",
  title: "욕실 수전에서 물이 새요",
  description: "세면대 아래 연결부에서 물방울이 떨어집니다.",
  priority: "normal" as const,
  status: "received" as const,
  requestedAt: "2026-08-30T00:20:00.000Z",
  scheduledAt: null,
  completedAt: null,
};

describe("MaintenanceView", () => {
  beforeEach(() => {
    submitOperation.mockResolvedValue({ status: "scheduled", unchanged: false });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("방문 일시를 선택한 뒤에만 일정을 저장한다", async () => {
    const user = userEvent.setup();
    const harness = ownerQueryHarness({ maintenance: [request] });
    vi.stubGlobal("fetch", harness.fetch);
    submitOperation.mockImplementation(async () => {
      harness.resources.maintenance = [{ ...request, status: "scheduled", scheduledAt: "2026-09-01T01:30:00.000Z" }];
      return { status: "scheduled", unchanged: false };
    });
    render(<MaintenanceView referenceTime="2026-08-30T01:00:00.000Z" />, { wrapper: harness.Wrapper });

    await user.click(screen.getByRole("button", { name: "방문 일정 정하기" }));
    expect(submitOperation).not.toHaveBeenCalled();

    const input = screen.getByLabelText("방문 날짜와 시간");
    fireEvent.change(input, { target: { value: "2026-09-01T10:30" } });
    await user.click(screen.getByRole("button", { name: "방문 일정 저장" }));

    expect(submitOperation).toHaveBeenCalledWith({
      type: "update_maintenance",
      requestId: "maintenance-302",
      status: "scheduled",
      scheduledAt: "2026-09-01T01:30:00.000Z",
    });
    expect(await screen.findByText("9월 1일 오전 10:30 방문 예정")).toBeTruthy();
  });

  it("자동 접근성 검사에서 위반이 없다", async () => {
    const { Wrapper } = ownerQueryHarness({ maintenance: [request] });
    const { container } = render(<MaintenanceView referenceTime="2026-08-30T01:00:00.000Z" initialScheduleId="maintenance-302" />, { wrapper: Wrapper });
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });

    expect(result.violations.map((violation) => violation.id)).toEqual([]);
  });
});
