/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { MarketingHeroPreview } from "./marketing-hero-preview";

describe("MarketingHeroPreview", () => {
  afterEach(cleanup);

  it("브리핑 건수와 일치하는 세 업무와 샘플 데이터 안내를 표시한다", () => {
    render(<MarketingHeroPreview />);

    expect(screen.getByRole("figure", { name: "집지기 오늘의 브리핑 미리보기" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "성수 리버하임" })).toBeTruthy();
    expect(screen.getByText("3건")).toBeTruthy();
    const tasks = screen.getByRole("list", { name: "확인이 필요한 일" });
    expect(within(tasks).getAllByRole("listitem")).toHaveLength(3);
    expect(within(tasks).getByText("302호 수리 요청")).toBeTruthy();
    expect(screen.getByText("가상 건물과 샘플 데이터로 구성한 미리보기입니다.")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("자동 접근성 검사에서 위반이 없다", async () => {
    const { container } = render(<main><MarketingHeroPreview /></main>);
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });

    expect(result.violations.map((violation) => violation.id)).toEqual([]);
  });
});
