import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  updatePreferences: vi.fn(),
  rateLimit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/dal", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("@/lib/data/repository", () => ({ updatePreferences: mocks.updatePreferences }));
vi.mock("@/lib/security/request", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/observability/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/operations/service", () => ({ OperationError: class extends Error {}, runOperation: vi.fn() }));

import { savePreferencesAction } from "./actions";

const preferences = {
  rentReminder: true,
  renewalReminder: true,
  maintenanceUpdates: true,
  marketing: false,
  quietHoursStart: "21:00",
  quietHoursEnd: "08:00",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireOwner.mockResolvedValue({ id: "current-owner" });
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.updatePreferences.mockResolvedValue(preferences);
});

describe("설정 저장의 계정 일치 검증", () => {
  it("다른 탭에서 계정이 바뀌면 이전 화면의 설정을 새 계정에 저장하지 않는다", async () => {
    const result = await savePreferencesAction(preferences, "previous-owner");

    expect(result).toMatchObject({ ok: false, code: "SESSION_CHANGED" });
    expect(mocks.updatePreferences).not.toHaveBeenCalled();
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("화면의 계정 식별자가 누락된 요청도 거부한다", async () => {
    const result = await savePreferencesAction(preferences, undefined as unknown as string);

    expect(result).toMatchObject({ ok: false, code: "SESSION_CHANGED" });
    expect(mocks.updatePreferences).not.toHaveBeenCalled();
  });

  it("화면과 세션의 계정이 일치할 때만 인증한 계정에 저장한다", async () => {
    expect(await savePreferencesAction(preferences, "current-owner")).toEqual({ ok: true, data: preferences });
    expect(mocks.updatePreferences).toHaveBeenCalledExactlyOnceWith("current-owner", preferences);
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/app", "layout");
  });

  it("계정 식별자를 알고 있어도 임대인 인증을 생략하지 않는다", async () => {
    mocks.requireOwner.mockRejectedValue(new Error("UNAUTHORIZED"));

    await expect(savePreferencesAction(preferences, "current-owner")).rejects.toThrow("UNAUTHORIZED");
    expect(mocks.updatePreferences).not.toHaveBeenCalled();
  });
});
