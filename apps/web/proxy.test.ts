import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("proxy", () => {
  it("존재하지 않는 공개 주소는 로그인으로 가로채지 않는다", () => {
    const response = proxy(new NextRequest("https://jipjigi.kr/존재하지-않는-주소"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("로그인하지 않은 운영 화면 요청은 로그인으로 보낸다", () => {
    const response = proxy(new NextRequest("https://jipjigi.kr/app/maintenance?schedule=maintenance-302"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://jipjigi.kr/login?next=%2Fapp%2Fmaintenance%3Fschedule%3Dmaintenance-302");
  });
});
