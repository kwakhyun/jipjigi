import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), saved: vi.fn(), restart: vi.fn(), setWorkspace: vi.fn(), setSession: vi.fn(), rateLimit: vi.fn(), redirect: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getOptionalSession: mocks.session }));
vi.mock("@/lib/auth/session", () => ({ savedDemoWorkspaceId: mocks.saved, setDemoWorkspaceCookie: mocks.setWorkspace, setSessionCookie: mocks.setSession }));
vi.mock("@/lib/demo/workspace", () => ({ demoEnabled: () => true, restartDemoWorkspace: mocks.restart, DemoWorkspaceError: class extends Error {} }));
vi.mock("@/lib/security/request", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "test-ip" }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, RedirectType: { replace: "replace" } }));

import { restartDemoAction } from "./demo-actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ userId: "owner-a", name: "데모", role: "owner", demoWorkspace: { id: "workspace-a" } });
  mocks.saved.mockResolvedValue("workspace-a");
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.restart.mockResolvedValue({ id: "new-workspace", ownerId: "new-owner", operatorId: "new-operator", expiresAt: "2026-09-01T00:00:00Z" });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
});
afterEach(() => vi.unstubAllEnvs());

function form() {
  const data = new FormData();
  data.set("variant", "agenda-first");
  data.set("confirm", "yes");
  data.set("workspaceId", "forged-other-workspace");
  return data;
}

describe("개인 데모 초기화의 서버 신뢰 경계", () => {
  it("클라이언트 공간 ID를 무시하고 인증된 공간만 초기화한 뒤 새 사용자로 이동한다", async () => {
    await expect(restartDemoAction({}, form())).rejects.toThrow("REDIRECT:/app");
    expect(mocks.restart).toHaveBeenCalledWith("workspace-a", "owner-a", "agenda-first");
    expect(mocks.setSession).toHaveBeenCalledWith({ userId: "new-owner", name: "데모", role: "owner" });
    expect(mocks.rateLimit).toHaveBeenCalledWith("demo-restart:test-ip", 3, 60_000);
  });
  it("서명 공간 쿠키와 현재 세션이 다르면 초기화하지 않는다", async () => {
    mocks.saved.mockResolvedValue("workspace-b");
    expect((await restartDemoAction({}, form())).error).toContain("데모 세션");
    expect(mocks.restart).not.toHaveBeenCalled();
  });
  it("명시적인 초기화 확인이 없거나 변형이 유효하지 않으면 거부한다", async () => {
    const data = form();
    data.delete("confirm");
    expect((await restartDemoAction({}, data)).error).toContain("동의");
    data.set("confirm", "yes");
    data.set("variant", "fake-variant");
    expect((await restartDemoAction({}, data)).error).toContain("홈 구성");
    expect(mocks.restart).not.toHaveBeenCalled();
  });
  it("요청 제한이나 비로그인 상태에서 저장을 실행하지 않는다", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false });
    expect((await restartDemoAction({}, form())).error).toContain("1분");
    mocks.session.mockResolvedValue(null);
    expect((await restartDemoAction({}, form())).error).toContain("로그인");
    expect(mocks.restart).not.toHaveBeenCalled();
  });
});
