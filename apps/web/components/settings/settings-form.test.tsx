/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const savePreferencesAction = vi.hoisted(() => vi.fn());

vi.mock("@/app/app/actions", () => ({ savePreferencesAction }));

import { SettingsForm } from "./settings-form";
import { ownerQueryHarness } from "@/lib/query/test-harness";
import { ownerKeys } from "@/lib/query/keys";

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
    savePreferencesAction.mockImplementation(async (data) => ({ ok: true, data }));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("변경한 알림 설정을 저장한다", async () => {
    const user = userEvent.setup();
    const { Wrapper, client } = ownerQueryHarness();
    client.setQueryData(ownerKeys.briefing("owner-1", "building-1"), { initial: true });
    render(<SettingsForm initial={initial} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("switch", { name: /제품 소식과 혜택/ }));
    fireEvent.change(screen.getByLabelText("시작"), { target: { value: "22:00" } });
    fireEvent.change(screen.getByLabelText("종료"), { target: { value: "09:00" } });
    await user.click(screen.getByRole("button", { name: "변경 사항 저장" }));

    expect(savePreferencesAction).toHaveBeenCalledWith({ ...initial, marketing: true, quietHoursStart: "22:00", quietHoursEnd: "09:00" }, "owner-1");
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("변경 사항을 저장했어요."));
    expect(client.getQueryData(ownerKeys.resource("owner-1", "preferences"))).toMatchObject({ marketing: true, quietHoursStart: "22:00" });
    expect(client.getQueryState(ownerKeys.briefing("owner-1", "building-1"))?.isInvalidated).toBe(true);
  });

  it("계정이 바뀌면 저장을 중단하고 현재 계정 설정으로 돌아갈 수 있다", async () => {
    const user = userEvent.setup();
    const { Wrapper, client } = ownerQueryHarness({ preferences: initial }, "previous-owner");
    savePreferencesAction.mockResolvedValue({ ok: false, code: "SESSION_CHANGED", error: "계정이 변경됐어요. 현재 계정의 설정을 다시 열어 주세요." });
    render(<SettingsForm initial={initial} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("switch", { name: /제품 소식과 혜택/ }));
    await user.click(screen.getByRole("button", { name: "변경 사항 저장" }));

    expect(savePreferencesAction).toHaveBeenCalledWith({ ...initial, marketing: true }, "previous-owner");
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("계정이 변경됐어요."));
    expect(screen.getByRole("link", { name: "현재 계정 설정 다시 열기" }).getAttribute("href")).toBe("/app/settings");
    expect((await screen.findByRole("button", { name: "변경 사항 저장" }) as HTMLButtonElement).disabled).toBe(true);
    expect(client.getQueryData(ownerKeys.resource("previous-owner", "preferences"))).toEqual(initial);
    expect(client.getQueryState(ownerKeys.resource("previous-owner", "preferences"))?.isInvalidated).toBe(false);
  });

  it("통신 실패 때 입력값을 유지해 같은 설정으로 다시 저장할 수 있다", async () => {
    const user = userEvent.setup();
    const { Wrapper, client } = ownerQueryHarness({ preferences: initial });
    savePreferencesAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<SettingsForm initial={initial} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("switch", { name: /제품 소식과 혜택/ }));
    fireEvent.change(screen.getByLabelText("시작"), { target: { value: "22:00" } });
    await user.click(screen.getByRole("button", { name: "변경 사항 저장" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("연결 상태를 확인하고 다시 시도해 주세요."));
    expect((screen.getByRole("switch", { name: /제품 소식과 혜택/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("시작") as HTMLInputElement).value).toBe("22:00");
    expect(client.getQueryData(ownerKeys.resource("owner-1", "preferences"))).toEqual(initial);
    await user.click(await screen.findByRole("button", { name: "변경 사항 저장" }));
    expect(savePreferencesAction).toHaveBeenNthCalledWith(2, { ...initial, marketing: true, quietHoursStart: "22:00" }, "owner-1");
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("변경 사항을 저장했어요."));
  });

  it("자동 접근성 검사에서 위반이 없다", async () => {
    const { container } = render(<SettingsForm initial={initial} />, { wrapper: ownerQueryHarness().Wrapper });
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });

    expect(result.violations.map((violation) => violation.id)).toEqual([]);
  });
});
