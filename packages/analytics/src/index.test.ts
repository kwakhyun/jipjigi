import { describe, expect, it } from "vitest";
import { sanitizeProperties } from "./index";

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
