import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));

let temporaryDirectory = "";
let getDatabase: typeof import("@/lib/db/client").getDatabase;
let closeDatabase: typeof import("@/lib/db/client").closeDatabase;
let createSessionToken: typeof import("./session").createSessionToken;
let getOptionalSession: typeof import("./dal").getOptionalSession;
let sessionFromRequest: typeof import("./dal").sessionFromRequest;

beforeAll(async () => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jipjigi-auth-test-"));
  process.env.DB_DIR = path.join(temporaryDirectory, "jipjigi-pg");
  process.env.ALLOW_DEMO_AUTH = "true";
  ({ getDatabase, closeDatabase } = await import("@/lib/db/client"));
  ({ createSessionToken } = await import("./session"));
  ({ getOptionalSession, sessionFromRequest } = await import("./dal"));
});

afterAll(async () => {
  await closeDatabase();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  delete process.env.DB_DIR;
  delete process.env.ALLOW_DEMO_AUTH;
});

describe("API 세션 재검증", () => {
  it("토큰이 발급된 뒤 역할이 바뀌면 데이터베이스의 현재 역할을 사용한다", async () => {
    const token = await createSessionToken({ userId: "auth-test-owner", name: "김서준", role: "owner" });
    const database = await getDatabase();
    await database.prepare("INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES ('auth-test-owner', 'auth@example.test', '김서준', '!', 'owner', ?)").run(new Date().toISOString());
    await database.prepare("UPDATE users SET role = 'operator' WHERE id = ?").run("auth-test-owner");

    const session = await sessionFromRequest(new Request("http://localhost/api/operations", {
      headers: { cookie: `jipjigi_demo_workspace=test-workspace; jipjigi_session=${encodeURIComponent(token)}` },
    }));

    expect(session).toMatchObject({ userId: "auth-test-owner", role: "operator" });
  });

  it("삭제된 사용자의 아직 만료되지 않은 토큰을 거부한다", async () => {
    const token = await createSessionToken({ userId: "operator-1", name: "집지기 운영자", role: "operator" });
    const database = await getDatabase();
    await database.prepare("DELETE FROM notification_preferences WHERE user_id = ?").run("operator-1");
    await database.prepare("DELETE FROM users WHERE id = ?").run("operator-1");

    const session = await sessionFromRequest(new Request("http://localhost/api/operations", {
      headers: { cookie: `jipjigi_session=${encodeURIComponent(token)}` },
    }));
    cookiesMock.mockResolvedValue({
      get: (name: string) => name === "jipjigi_session" ? { value: token } : undefined,
    });
    const browserSession = await getOptionalSession();

    expect(session).toBeNull();
    expect(browserSession).toBeNull();
  });
  it("기존 공유 데모 세션과 만료된 개인 공간 세션을 거부한다", async () => {
    const { enterDemoWorkspace } = await import("@/lib/demo/workspace");
    const workspace = await enterDemoWorkspace();
    const token = await createSessionToken({ userId: workspace.ownerId, name: "김서준", role: "owner" });
    const request = (value: string) => new Request("http://localhost/api/operations", { headers: { cookie: `jipjigi_session=${value}` } });
    expect(await sessionFromRequest(request(token))).toMatchObject({ userId: workspace.ownerId });
    const database = await getDatabase();
    await database.prepare("UPDATE demo_workspaces SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), workspace.id);
    expect(await sessionFromRequest(request(token))).toBeNull();
    const old = await createSessionToken({ userId: "owner-1", name: "김서준", role: "owner" });
    expect(await sessionFromRequest(request(old))).toBeNull();
  });
});
