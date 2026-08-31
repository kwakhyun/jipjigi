import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
import { createDemoWorkspaceToken, createSessionToken, readDemoWorkspaceToken, readSessionToken } from "./session";

describe("데모 공간 쿠키의 서명과 목적 분리", () => {
  it("서명한 공간 ID만 복원하고 일반 로그인 토큰을 공간 쿠키로 받지 않는다", async () => {
    const id = randomUUID();
    const token = await createDemoWorkspaceToken(id, new Date(Date.now() + 60_000).toISOString());
    expect(await readDemoWorkspaceToken(token)).toBe(id);
    expect(await readSessionToken(token)).toBeNull();
    expect(await readDemoWorkspaceToken(await createSessionToken({ userId: "test", role: "owner", name: "테스트" }))).toBeNull();
  });
  it("위변조, 만료, 유효하지 않은 ID를 거부한다", async () => {
    const token = await createDemoWorkspaceToken(randomUUID(), new Date(Date.now() + 60_000).toISOString());
    expect(await readDemoWorkspaceToken(`${token.slice(0, -8)}modified`)).toBeNull();
    expect(await readDemoWorkspaceToken(await createDemoWorkspaceToken(randomUUID(), new Date(Date.now() - 60_000).toISOString()))).toBeNull();
    expect(await readDemoWorkspaceToken(await createDemoWorkspaceToken("owner-1", new Date(Date.now() + 60_000).toISOString()))).toBeNull();
  });
});
