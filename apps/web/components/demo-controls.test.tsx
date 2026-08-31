/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/app/app/demo-actions", () => ({ restartDemoAction: vi.fn() }));
import { DemoControls } from "./demo-controls";

afterEach(cleanup);
describe("데모 초기화 안내", () => {
  it.each(["risk-first", "agenda-first"] as const)("%s 구성을 보여주고 초기화 동의를 요구한다", (variant) => {
    render(<DemoControls variant={variant} />);
    expect((screen.getByRole("combobox", { name: "체험할 홈 구성" }) as HTMLSelectElement).value).toBe(variant);
    expect((screen.getByRole("checkbox") as HTMLInputElement).required).toBe(true);
    expect(screen.getByText(/다른 방문자의 데이터는 바뀌지 않습니다/)).toBeTruthy();
  });
  it("입력 이름, 역할과 안내가 자동 접근성 검사를 통과한다", async () => {
    const { container } = render(<DemoControls variant="risk-first" />);
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((violation) => violation.id)).toEqual([]);
  });
});
