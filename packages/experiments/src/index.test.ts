import { describe, expect, it } from "vitest";
import { assignVariant, briefingPriorityExperiment } from "./index";

describe("assignVariant", () => {
  it("is deterministic for the same subject", () => {
    const first = assignVariant(briefingPriorityExperiment, "owner-1");
    expect(assignVariant(briefingPriorityExperiment, "owner-1")).toBe(first);
  });

  it("returns a configured variant", () => {
    expect(briefingPriorityExperiment.variants).toContain(
      assignVariant(briefingPriorityExperiment, "owner-2"),
    );
  });
});
