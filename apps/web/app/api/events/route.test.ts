import { describe, expect, it, vi } from "vitest";
const { record } = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("@/lib/analytics/server", () => ({ recordBrowserProductEvent: record }));
vi.mock("@/lib/auth/dal", () => ({ sessionFromRequest: async () => ({ userId: "owner-1" }) }));
vi.mock("@/lib/security/request", () => ({ assertSameOrigin: vi.fn(), rateLimit: async () => ({ allowed: true }) }));
import { POST } from "./route";

describe("이벤트 API", () => {
  it("브라우저 전용 수집 경로를 사용하고 검증 실패를 400으로 반환한다", async () => {
    record.mockRejectedValueOnce(new Error("invalid event"));
    const response = await POST(new Request("http://localhost/api/events", { method: "POST", body: JSON.stringify({ name: "payment_marked" }) }));
    expect(response.status).toBe(400);
    expect(record).toHaveBeenCalledWith({ name: "payment_marked" }, "owner-1");
  });
});
