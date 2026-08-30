/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getOptionalSession: mocks.session }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./actions", () => ({ loginAction: vi.fn(async () => ({})), logoutAction: vi.fn() }));

import LoginPage from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); });
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("로그인된 계정에서도 접근 가능한 데모 선택", () => {
  it.each([
    ["owner", "operator", "그로스 데모"],
    ["operator", "owner", "임대인 데모"],
  ] as const)("%s 로그인 상태에서 %s 데모 링크를 열어도 강제 이동하지 않는다", async (currentRole, mode, label) => {
    vi.stubEnv("ALLOW_DEMO_AUTH", "true");
    mocks.session.mockResolvedValue({ userId: `${currentRole}-1`, name: "데모", email: "demo@jipjigi.kr", role: currentRole });
    render(await LoginPage({ searchParams: Promise.resolve({ mode }) }));
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "현재 로그인 상태" })).toBeTruthy();
  });

  it("일반 서비스 모드의 기존 로그인 리다이렉트는 유지한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEMO_AUTH", "false");
    mocks.session.mockResolvedValue({ role: "owner" });
    await expect(LoginPage({ searchParams: Promise.resolve({ mode: "operator" }) })).rejects.toThrow("NEXT_REDIRECT:/app");
  });
});
