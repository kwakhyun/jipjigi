/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({ usePathname: () => "/app" }));
vi.mock("./page-analytics", () => ({ PageAnalytics: () => null }));

describe("AppShell", () => {
  afterEach(cleanup);

  it("임대인 모바일 헤더에서 설정과 로그아웃 화면으로 이동할 수 있다", () => {
    render(
      <AppShell user={{ name: "김서준", email: "demo@jipjigi.kr", role: "owner" }}>
        <p>본문</p>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "설정 및 계정 열기" }).getAttribute("href")).toBe("/app/settings");
    expect(screen.getByRole("navigation", { name: "모바일 주요 메뉴" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /메시지/ }).some((link) => link.getAttribute("href") === "/app/messages")).toBe(true);
  });

  it("자동 접근성 검사에서 위반이 없다", async () => {
    const { container } = render(
      <AppShell user={{ name: "김서준", email: "demo@jipjigi.kr", role: "owner" }}>
        <p>본문</p>
      </AppShell>,
    );
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });

    expect(result.violations.map((violation) => violation.id)).toEqual([]);
  });
});
