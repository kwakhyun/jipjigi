import { describe, expect, it } from "vitest";
import { sanitizeProperties } from "./index";

describe("sanitizeProperties", () => {
  it("drops arbitrary PII-shaped properties", () => {
    expect(
      sanitizeProperties({ unit_id: "unit-1", tenant_phone: "010-0000-0000", outcome: "accepted" }),
    ).toEqual({ unit_id: "unit-1", outcome: "accepted" });
  });
});
