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

  it.each(["2026-10-21T22:59:00Z", "2026-10-21T23:00:00Z", "2026-10-22T06:00:00Z"])(
    "disables quiet hours when both endpoints are equal at %s",
    (timestamp) => {
      expect(evaluateGuardrails({ ...base, quietHoursStart: "08:00", quietHoursEnd: "08:00", now: new Date(timestamp) })).toEqual({ outcome: "allowed" });
    },
  );

  it("still checks consent and frequency when quiet hours are disabled", () => {
    const input = { ...base, quietHoursStart: "08:00", quietHoursEnd: "08:00", now: new Date("2026-10-22T06:00:00Z") };
    expect(evaluateGuardrails({ ...input, consent: false })).toEqual({ outcome: "blocked", reason: "missing_consent" });
    expect(evaluateGuardrails({ ...input, recentDispatchCount: 2 })).toEqual({ outcome: "blocked", reason: "frequency_cap" });
  });

  it.each([
    ["21:00", "08:00", "2026-10-22T12:00:00Z", "2026-10-22T23:05:00.000Z"],
    ["21:00", "08:00", "2026-10-22T22:59:00Z", "2026-10-22T23:05:00.000Z"],
    ["08:00", "17:00", "2026-10-22T06:00:00Z", "2026-10-22T08:05:00.000Z"],
    ["23:00", "00:00", "2026-12-31T14:59:00Z", "2026-12-31T15:05:00.000Z"],
  ])("schedules after the request for %s–%s at %s", (quietHoursStart, quietHoursEnd, timestamp, scheduledFor) => {
    const now = new Date(timestamp);
    const decision = evaluateGuardrails({ ...base, quietHoursStart, quietHoursEnd, now });
    expect(decision).toEqual({ outcome: "scheduled", reason: "quiet_hours", scheduledFor });
    expect(Date.parse(scheduledFor)).toBeGreaterThan(now.getTime());
  });

  it("allows requests exactly at the end of quiet hours", () => {
    expect(evaluateGuardrails({ ...base, now: new Date("2026-10-22T23:00:00Z") })).toEqual({ outcome: "allowed" });
  });

  it("blocks after two deliveries within seven days", () => {
    expect(evaluateGuardrails({ ...base, recentDispatchCount: 2, now: new Date("2026-08-29T06:00:00Z") })).toEqual({
      outcome: "blocked",
      reason: "frequency_cap",
    });
  });
});
