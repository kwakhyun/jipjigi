/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { MarketingHeader } from "./marketing-header";

describe("MarketingHeader", () => {
  afterEach(cleanup);

  it("핵심 공개 경로를 접근 가능한 이름으로 제공한다", () => {
    render(<MarketingHeader />);

    expect(screen.getByRole("navigation", { name: "소개 메뉴" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "집지기 홈" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "운영 데모 열기" }).getAttribute("href")).toBe("/login?mode=owner");
  });

  it("자동 접근성 검사에서 위반이 없다", async () => {
    const { container } = render(<MarketingHeader />);
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });

    expect(result.violations.map((violation) => violation.id)).toEqual([]);
  });
});
