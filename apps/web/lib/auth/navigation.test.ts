import { describe, expect, it } from "vitest";
import { postLoginPath } from "./navigation";

describe("역할별 로그인 목적지", () => {
  it("다른 데모에서 남은 목적지는 현재 계정의 홈으로 바꾼다", () => {
    expect(postLoginPath("owner", "/app/growth")).toBe("/app");
    expect(postLoginPath("operator", "/app/contracts")).toBe("/app/growth");
    expect(postLoginPath("operator", "/app")).toBe("/app/growth");
  });

  it("허용된 화면의 검색 조건은 유지한다", () => {
    expect(postLoginPath("owner", "/app/messages?status=failed")).toBe("/app/messages?status=failed");
    expect(postLoginPath("operator", "/app/settings")).toBe("/app/settings");
  });

  it.each(["https://example.com", "//example.com", "/\\example.com", "/app/../../login", "/app/growth/details", "/app/unknown", "/app%2fmessages", "javascript:alert(1)"])("허용되지 않은 목적지를 거부한다: %s", (path) => {
    expect(postLoginPath("owner", path)).toBe("/app");
  });
});
