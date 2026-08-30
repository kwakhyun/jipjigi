/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

vi.mock("./actions", () => ({ loginAction: vi.fn(async () => ({})) }));
afterEach(cleanup);

describe("두 데모의 로그인 선택", () => {
  it("탭을 바꾸면 계정, 설명, 제출 목적지와 버튼이 함께 바뀐다", async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginForm demoEnabled initialMode="owner" nextPath="/app" />);
    await user.click(screen.getByRole("button", { name: "그로스 데모" }));
    expect((screen.getByLabelText("이메일") as HTMLInputElement).value).toBe("growth@jipjigi.kr");
    expect((container.querySelector('[name="next"]') as HTMLInputElement).value).toBe("/app/growth");
    expect(screen.getByRole("status").textContent).toContain("개별 임대 계약은 열람할 수 없습니다.");
    expect(screen.getByRole("button", { name: "그로스 데모 시작하기" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "임대인 데모" }));
    expect((screen.getByLabelText("이메일") as HTMLInputElement).value).toBe("demo@jipjigi.kr");
    expect((container.querySelector('[name="next"]') as HTMLInputElement).value).toBe("/app");
    expect(screen.getByRole("button", { name: "임대인 데모 시작하기" })).toBeTruthy();
  });

  it("그로스 링크로 들어와도 임대인 데모를 선택할 수 있다", async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginForm demoEnabled initialMode="operator" nextPath="/app/growth" />);
    await user.click(screen.getByRole("button", { name: "임대인 데모" }));
    expect((container.querySelector('[name="next"]') as HTMLInputElement).value).toBe("/app");
  });

  it("데모를 끄면 역할 선택과 미리 채운 인증 정보가 없다", () => {
    render(<LoginForm demoEnabled={false} nextPath="/app" />);
    expect(screen.queryByRole("group", { name: "데모 계정 선택" })).toBeNull();
    expect((screen.getByLabelText("이메일") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
  });

  it("역할 설명을 포함한 로그인 폼의 접근성 검사에서 위반이 없다", async () => {
    const { container } = render(<main><LoginForm demoEnabled nextPath="/app" /></main>);
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map(({ id }) => id)).toEqual([]);
  });
});
