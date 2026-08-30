import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), compare: vi.fn(), setSession: vi.fn(), clearSession: vi.fn(),
  revalidate: vi.fn(), redirect: vi.fn(), rateLimit: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, RedirectType: { replace: "replace" } }));
vi.mock("@/lib/data/repository", () => ({ getUserByEmail: mocks.user }));
vi.mock("@/lib/auth/session", () => ({ setSessionCookie: mocks.setSession, clearSessionCookie: mocks.clearSession }));
vi.mock("@/lib/security/request", () => ({ rateLimit: mocks.rateLimit }));

import { loginAction, logoutAction } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.compare.mockResolvedValue(true);
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); });
});
afterEach(() => vi.unstubAllEnvs());

function loginForm(next: string) {
  const form = new FormData();
  form.set("email", "demo@jipjigi.kr");
  form.set("password", "demo1234!");
  form.set("next", next);
  return form;
}

describe("로그인과 로그아웃의 계정 전환", () => {
  it.each([
    ["owner", "/app/growth", "/app"],
    ["operator", "/app/contracts", "/app/growth"],
  ] as const)("%s 계정의 실제 권한으로 세션과 이동 경로를 갱신한다", async (role, next, destination) => {
    mocks.user.mockResolvedValue({ id: `${role}-1`, name: "데모", role, passwordHash: "hash" });
    await expect(loginAction({}, loginForm(next))).rejects.toThrow(`NEXT_REDIRECT:${destination}`);
    expect(mocks.setSession).toHaveBeenCalledWith({ userId: `${role}-1`, name: "데모", role });
    expect(mocks.revalidate).toHaveBeenCalledWith("/app", "layout");
    expect(mocks.redirect).toHaveBeenCalledWith(destination, "replace");
  });

  it("인증 실패 시 기존 세션을 바꾸지 않는다", async () => {
    mocks.user.mockResolvedValue({ id: "owner-1", name: "데모", role: "owner", passwordHash: "hash" });
    mocks.compare.mockResolvedValue(false);
    expect((await loginAction({}, loginForm("/app"))).error).toBe("이메일 또는 비밀번호가 올바르지 않습니다.");
    expect(mocks.setSession).not.toHaveBeenCalled();
    expect(mocks.clearSession).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["owner", "operator"])("전환 시 먼저 로그아웃하고 %s 로그인 선택을 유지한다", async (mode) => {
    vi.stubEnv("ALLOW_DEMO_AUTH", "true");
    const form = new FormData();
    form.set("mode", mode);
    await expect(logoutAction(form)).rejects.toThrow(`NEXT_REDIRECT:/login?mode=${mode}`);
    expect(mocks.clearSession).toHaveBeenCalledOnce();
    expect(mocks.setSession).not.toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledWith("/app", "layout");
    expect(mocks.clearSession.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]!);
  });

  it("일반 로그아웃과 유효하지 않은 데모 선택은 로그인 페이지로 돌아간다", async () => {
    const form = new FormData();
    form.set("mode", "https://example.com");
    await expect(logoutAction(form)).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login", "replace");
  });

  it("데모가 비활성화된 배포에서는 데모 전환 목적지를 사용하지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEMO_AUTH", "false");
    const form = new FormData();
    form.set("mode", "operator");
    await expect(logoutAction(form)).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login", "replace");
  });
});
