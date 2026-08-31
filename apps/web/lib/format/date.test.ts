import { describe, expect, it } from "vitest";
import { daysUntilDate, formatKoreanScheduleDateTime, relativeDayLabel } from "./date";

describe("date formatting", () => {
  it("uses the server-provided reference time for Seoul day calculations", () => {
    expect(daysUntilDate("2026-09-10", "2026-08-29T15:30:00.000Z")).toBe(11);
  });

  it("keeps relative labels deterministic across hydration", () => {
    expect(relativeDayLabel("2026-08-28T00:00:00.000Z", "2026-08-29T12:00:00.000Z")).toBe("1일 전");
    expect(relativeDayLabel("2026-08-29T08:00:00.000Z", "2026-08-29T12:00:00.000Z")).toBe("오늘");
  });

  it("uses Korean day periods regardless of the runtime locale", () => {
    expect(formatKoreanScheduleDateTime("2026-09-01T01:30:00.000Z")).toBe("9월 1일 오전 10:30");
    expect(formatKoreanScheduleDateTime("2026-09-01T06:05:00.000Z")).toBe("9월 1일 오후 3:05");
  });
  it("counts Seoul calendar boundaries rather than elapsed 24-hour periods", () => {
    expect(relativeDayLabel("2026-08-31T14:50:00.000Z", "2026-08-31T15:10:00.000Z")).toBe("1일 전");
  });
});
