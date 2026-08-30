/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const savePreferencesAction = vi.hoisted(() => vi.fn());

vi.mock("@/app/app/actions", () => ({ savePreferencesAction }));

import { SettingsForm } from "./settings-form";

const initial = {
  rentReminder: true,
  renewalReminder: true,
  maintenanceUpdates: true,
  marketing: false,
  quietHoursStart: "21:00",
  quietHoursEnd: "08:00",
};

describe("SettingsForm", () => {
  beforeEach(() => {
    savePreferencesAction.mockResolvedValue({ ok: true, data: initial });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("변경한 알림 설정을 저장한다", async () => {
    const user = userEvent.setup();
    render(<SettingsForm initial={initial} />);

    await user.click(screen.getByRole("switch", { name: /제품 소식과 혜택/ }));
    fireEvent.change(screen.getByLabelText("시작"), { target: { value: "22:00" } });
    fireEvent.change(screen.getByLabelText("종료"), { target: { value: "09:00" } });
    await user.click(screen.getByRole("button", { name: "변경 사항 저장" }));

    expect(savePreferencesAction).toHaveBeenCalledWith({ ...initial, marketing: true, quietHoursStart: "22:00", quietHoursEnd: "09:00" });
    expect((await screen.findByRole("status")).textContent).toContain("변경 사항을 저장했어요.");
  });

  it("자동 접근성 검사에서 위반이 없다", async () => {
    const { container } = render(<SettingsForm initial={initial} />);
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });

    expect(result.violations.map((violation) => violation.id)).toEqual([]);
  });
});
