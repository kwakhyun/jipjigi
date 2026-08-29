import { describe, expect, it } from "vitest";
import { WebVitalPayloadSchema } from "./schema";

const validMetric = {
  id: "a47e1c52-bfc7-4510-98f1-33bb0ad3f451",
  metricId: "v4-1700000000000-123456789",
  name: "LCP",
  value: 1_820.4,
  delta: 1_820.4,
  rating: "good",
  navigationType: "navigate",
  path: "/app",
  anonymousId: "anonymous-123",
  sessionId: "session-123",
  occurredAt: "2026-08-30T00:00:00.000Z",
};

describe("WebVitalPayloadSchema", () => {
  it("정상적인 브라우저 성능 지표를 허용한다", () => {
    expect(WebVitalPayloadSchema.parse(validMetric)).toEqual(validMetric);
  });

  it("알 수 없는 지표와 외부 경로를 거부한다", () => {
    expect(WebVitalPayloadSchema.safeParse({ ...validMetric, name: "CPU" }).success).toBe(false);
    expect(WebVitalPayloadSchema.safeParse({ ...validMetric, path: "https://example.com" }).success).toBe(false);
  });
});
