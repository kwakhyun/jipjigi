import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), read: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ sessionFromRequest: mocks.session }));
vi.mock("@/lib/data/repository", () => ({ listContracts: mocks.read, listLedger: mocks.read, listMaintenance: mocks.read, listMessages: mocks.read }));
vi.mock("@/lib/data/notification-settings", () => ({ getNotificationSettings: mocks.read }));
vi.mock("@/lib/security/request", () => ({ rateLimit: mocks.limit }));
import { GET } from "./route";

const request = new Request("https://jipjigi.test/api/workspace/contracts?ownerId=other");
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ userId: "owner-1", role: "owner" }); mocks.read.mockResolvedValue([]); mocks.limit.mockResolvedValue({ allowed: true }); });

describe("임대인 목록 조회 API", () => {
  it.each(["contracts", "ledger", "maintenance", "messages", "preferences"])("%s를 세션 소유자로만 조회하고 공유 캐시를 금지한다", async (resource) => {
    const response = await GET(request, { params: Promise.resolve({ resource }) });
    expect(response.status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith("owner-1");
    expect(await response.json()).toEqual({ ownerId: "owner-1", data: [] });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it.each([[null, 401], [{ userId: "operator-1", role: "operator" }, 403]])("인증 또는 역할이 없으면 조회를 거부한다: %s", async (session, status) => {
    mocks.session.mockResolvedValue(session);
    expect((await GET(request, { params: Promise.resolve({ resource: "contracts" }) })).status).toBe(status);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("허용 목록 외의 경로, 요청 제한과 저장소 오류를 구분한다", async () => {
    expect((await GET(request, { params: Promise.resolve({ resource: "toString" }) })).status).toBe(404);
    mocks.limit.mockResolvedValueOnce({ allowed: false });
    expect((await GET(request, { params: Promise.resolve({ resource: "ledger" }) })).status).toBe(429);
    mocks.read.mockRejectedValueOnce(new Error("private database detail"));
    const response = await GET(request, { params: Promise.resolve({ resource: "ledger" }) });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private database detail");
  });
});
