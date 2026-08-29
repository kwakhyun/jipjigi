import { describe, expect, it } from "vitest";
import { daysUntilDate, relativeDayLabel } from "./date";

describe("date formatting", () => {
  it("uses the server-provided reference time for Seoul day calculations", () => {
    expect(daysUntilDate("2026-09-10", "2026-08-29T15:30:00.000Z")).toBe(11);
  });

  it("keeps relative labels deterministic across hydration", () => {
    expect(relativeDayLabel("2026-08-28T00:00:00.000Z", "2026-08-29T12:00:00.000Z")).toBe("1일 전");
    expect(relativeDayLabel("2026-08-29T08:00:00.000Z", "2026-08-29T12:00:00.000Z")).toBe("오늘");
  });
});
