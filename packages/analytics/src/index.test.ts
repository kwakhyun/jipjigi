import { describe, expect, it } from "vitest";
import { ProductEventSchema, sanitizeProperties } from "./index";

describe("sanitizeProperties", () => {
  it("drops arbitrary PII-shaped properties", () => {
    expect(
      sanitizeProperties({ unit_id: "unit-1", tenant_phone: "010-0000-0000", outcome: "accepted" }),
    ).toEqual({ unit_id: "unit-1", outcome: "accepted" });
  });

  it("keeps the reviewed CRM and experiment properties", () => {
    expect(
      sanitizeProperties({
        risk_type: "lease_expiring",
        template_version: "v1",
        consent_checked: true,
        quiet_hours_applied: false,
        provider_status: "delivered",
      }),
    ).toEqual({
      risk_type: "lease_expiring",
      template_version: "v1",
      consent_checked: true,
      quiet_hours_applied: false,
      provider_status: "delivered",
    });
  });
});

describe("이벤트별 속성 계약", () => {
  const base = { eventId: "62a65ed0-707a-4d43-8c7b-ff9985192c26", anonymousId: "anonymous-test", sessionId: "session-test", path: "/app", occurredAt: "2026-08-31T00:00:00.000Z", context: { releaseVersion: "test", userSegment: "owner" } };
  it("납부 이벤트의 필수 속성과 완료 상태를 검사한다", () => {
    expect(ProductEventSchema.safeParse({ ...base, name: "payment_marked", properties: {} }).success).toBe(false);
    expect(ProductEventSchema.safeParse({ ...base, name: "payment_marked", properties: { charge_id: "c1", outcome: "paid" } }).success).toBe(true);
    expect(ProductEventSchema.safeParse({ ...base, name: "payment_marked", properties: { charge_id: "c1", outcome: "failed" } }).success).toBe(false);
  });
  it("위험 근거 이벤트는 실제 대상 식별자가 필요하다", () => {
    expect(ProductEventSchema.safeParse({ ...base, name: "risk_evidence_opened", properties: { source: "home_priority", risk_type: "lease_expiring" } }).success).toBe(false);
  });
});
