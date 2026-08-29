import { describe, expect, it } from "vitest";
import { evaluateGuardrails } from "./guardrails";

const base = {
  consent: true,
  recentDispatchCount: 0,
  quietHoursStart: "21:00",
  quietHoursEnd: "08:00",
};

describe("message guardrails", () => {
  it("blocks when contact consent is missing", () => {
    expect(evaluateGuardrails({ ...base, consent: false, now: new Date("2026-08-29T06:00:00Z") })).toEqual({
      outcome: "blocked",
      reason: "missing_consent",
    });
  });

  it("schedules messages sent during Seoul quiet hours", () => {
    expect(evaluateGuardrails({ ...base, now: new Date("2026-08-29T13:00:00Z") })).toMatchObject({
      outcome: "scheduled",
      reason: "quiet_hours",
    });
  });

  it("allows a daytime transactional message", () => {
    expect(evaluateGuardrails({ ...base, now: new Date("2026-08-29T06:00:00Z") })).toEqual({ outcome: "allowed" });
  });

  it("blocks after two deliveries within seven days", () => {
    expect(evaluateGuardrails({ ...base, recentDispatchCount: 2, now: new Date("2026-08-29T06:00:00Z") })).toEqual({
      outcome: "blocked",
      reason: "frequency_cap",
    });
  });
});
