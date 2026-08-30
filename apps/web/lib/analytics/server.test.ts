import { beforeEach, describe, expect, it, vi } from "vitest";
import { briefingPriorityExperiment } from "@jipjigi/experiments";

const { run, get, prepare } = vi.hoisted(() => {
  const run = vi.fn();
  const get = vi.fn();
  return { run, get, prepare: vi.fn(() => ({ run, get })) };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ getDatabase: async () => ({ prepare }) }));
import { recordBrowserProductEvent, recordServerProductEvent } from "./server";

function event(name: string, properties: Record<string, unknown> = {}) {
  return { eventId: crypto.randomUUID(), name, anonymousId: crypto.randomUUID(), sessionId: crypto.randomUUID(), path: "/app", occurredAt: new Date().toISOString(), context: { releaseVersion: "spoofed", experimentKey: "spoofed", variant: "agenda-first", userSegment: "operator" }, properties };
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async () => ({ role: "owner", experimentKey: briefingPriorityExperiment.key, variant: "risk-first" }));
});

describe("브라우저 이벤트의 신뢰 경계", () => {
  it.each(["payment_marked", "renewal_started", "crm_message_delivery_updated"])("서버 전용 %s를 브라우저에서 기록하지 못한다", async (name) => {
    const properties = { charge_id: "charge-1", lease_id: "lease-1", outcome: "paid", channel: "sandbox_alimtalk", message_id: "message-1", provider_status: "delivered", retry_count: 0 };
    await expect(recordBrowserProductEvent(event(name, properties), "owner-1")).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });

  it("노출 봉투와 속성을 모두 서버 배정으로 확정한다", async () => {
    await recordBrowserProductEvent(event("experiment_exposed", { experiment_key: "spoofed", variant: "agenda-first", risk_type: "lease_expiring", risk_signal_id: "lease-1" }), "owner-1");
    const stored = run.mock.calls[0]!;
    expect(stored[8]).toBe(briefingPriorityExperiment.key);
    expect(stored[9]).toBe("risk-first");
    expect(stored[10]).toBe("owner");
    expect(JSON.parse(stored[6])).toMatchObject({ experiment_key: briefingPriorityExperiment.key, variant: "risk-first" });
  });

  it("배정 없는 노출과 익명 제품 이벤트를 거부한다", async () => {
    get.mockResolvedValue(undefined);
    await expect(recordBrowserProductEvent(event("experiment_exposed", { experiment_key: "x", variant: "risk-first", risk_type: "none", risk_signal_id: "none" }), "owner-1")).rejects.toThrow();
    await expect(recordBrowserProductEvent(event("page_viewed"), null)).rejects.toThrow("EVENT_AUTH_REQUIRED");
    expect(run).not.toHaveBeenCalled();
  });

  it("익명 SEO 클릭에는 조작한 실험·사용자 문맥을 저장하지 않는다", async () => {
    await recordBrowserProductEvent(event("seo_cta_clicked", { source: "seongsu", variant: "agenda-first" }), null);
    const stored = run.mock.calls[0]!;
    expect(stored.slice(8, 11)).toEqual([null, null, "anonymous"]);
    expect(JSON.parse(stored[6])).toEqual({ source: "seongsu" });
  });

  it("서버에서도 필수 속성이 없는 완료 이벤트를 거부한다", async () => {
    await expect(recordServerProductEvent("payment_marked", "owner-1", "/app/ledger", {})).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    await recordServerProductEvent("payment_marked", "owner-1", "/app/ledger", { charge_id: "charge-1", outcome: "paid" });
    expect(run).toHaveBeenCalledOnce();
  });

  it("미래와 24시간 이상 지난 브라우저 이벤트를 거부한다", async () => {
    for (const delta of [-25 * 60 * 60_000, 10 * 60_000]) {
      await expect(recordBrowserProductEvent({ ...event("page_viewed"), occurredAt: new Date(Date.now() + delta).toISOString() }, "owner-1")).rejects.toThrow();
    }
    expect(run).not.toHaveBeenCalled();
  });
});
