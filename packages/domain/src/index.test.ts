import { describe, expect, it } from "vitest";
import { OperationSchema } from "./index";

describe("OperationSchema", () => {
  it("방문 예정 상태에 ISO 형식의 방문 일시를 허용한다", () => {
    const result = OperationSchema.safeParse({
      type: "update_maintenance",
      requestId: "maintenance-302",
      status: "scheduled",
      scheduledAt: "2026-09-01T01:30:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  it("잘못된 방문 일시 형식을 거부한다", () => {
    const result = OperationSchema.safeParse({
      type: "update_maintenance",
      requestId: "maintenance-302",
      status: "scheduled",
      scheduledAt: "2026년 9월 1일 오전 10시",
    });

    expect(result.success).toBe(false);
  });
});
