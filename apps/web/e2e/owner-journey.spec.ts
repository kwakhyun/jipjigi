import axe from "axe-core";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, role: "owner" | "operator" = "owner") {
  await page.goto(`/login?mode=${role}`);
  await page.getByRole("button", { name: role === "owner" ? "임대인 데모 시작하기" : "그로스 데모 시작하기", exact: true }).click();
  await expect(page).toHaveURL(role === "owner" ? /\/app$/ : /\/app\/growth$/);
}

test("계약에서 메시지를 접수하고 새로고침과 역할 전환 후에도 결과를 확인한다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await page.reload();
  await expect(page.getByRole("region", { name: "최근 청구월 운영 지표" })).toBeVisible();
  await page.getByRole("link", { name: "계약 관리", exact: true }).click();
  await expect(page.getByRole("heading", { name: "계약 관리", exact: true })).toBeVisible();
  await expect(page.locator(".contract-row")).toHaveCount(25);
  await page.getByRole("link", { name: "갱신 안내 확인", exact: true }).click();
  await expect(page.getByText("이민지님께 보낼 내용", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "발송 조건 확인 후 접수", exact: true }).click();
  await expect(page.locator(".outbox-row")).toHaveCount(1);
  await expect(page.locator(".outbox-row")).toContainText(/접수|예약/);
  await page.reload();
  await expect(page.locator(".outbox-row")).toHaveCount(1);
  await expect(page.locator(".outbox-row")).toContainText("성수 리버하임 501호");
  await page.getByRole("link", { name: "계약 관리", exact: true }).click();
  await expect(page.getByText("응답 대기", { exact: true })).toBeVisible();
  await expect(page.getByText(/갱신 연락 기록 1건/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/갱신 연락 기록 1건/)).toBeVisible();
  await page.getByRole("button", { name: "그로스 데모로 전환", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?mode=operator$/);
  await page.getByRole("button", { name: "그로스 데모 시작하기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "그로스 관제", exact: true })).toBeVisible();
  await expect(page.getByText("현재 체험 공간의 데이터", { exact: true })).toBeVisible();
  await expect(page.locator(".growth-kpi").filter({ hasText: "메시지 요청" }).locator("strong")).toHaveText("1");
  expect((await page.request.get("/api/workspace/contracts")).status()).toBe(403);
  expect(errors).toEqual([]);
});

test("서로 다른 브라우저의 계약, 변경 권한과 그로스 이벤트가 격리된다", async ({ page, browser }) => {
  const other = await browser.newContext({ baseURL: "http://localhost:3118", locale: "ko-KR", timezoneId: "Asia/Seoul" });
  try {
    const otherPage = await other.newPage();
    await login(page);
    await login(otherPage);
    const a = await (await page.request.get("/api/workspace/maintenance")).json();
    const b = await (await other.request.get("/api/workspace/maintenance")).json();
    expect(a.ownerId).not.toBe(b.ownerId);
    expect(a.data[0].id).not.toBe(b.data[0].id);
    const forbidden = await other.request.post("/api/operations", {
      data: { type: "update_maintenance", requestId: a.data[0].id, status: "completed" },
    });
    expect(forbidden.status()).toBe(404);
    await page.getByRole("link", { name: "수리 요청", exact: true }).click();
    await page.getByRole("button", { name: "방문 일정 정하기", exact: true }).click();
    const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 86_400_000));
    await page.getByLabel("방문 날짜와 시간").fill(`${tomorrow}T14:00`);
    await page.getByRole("button", { name: "방문 일정 저장", exact: true }).click();
    await expect(page.getByText("방문 예정", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("방문 예정", { exact: true })).toBeVisible();
    await otherPage.goto("/app/maintenance");
    await expect(otherPage.getByText("새 요청", { exact: true })).toBeVisible();
    expect((await (await other.request.get("/api/workspace/maintenance")).json()).data[0].status).toBe("received");
    await otherPage.getByRole("button", { name: "그로스 데모로 전환", exact: true }).click();
    await expect(otherPage).toHaveURL(/\/login\?mode=operator$/);
    await login(otherPage, "operator");
    await expect(otherPage.locator(".growth-kpi").filter({ hasText: "운영 조치" }).locator("strong")).toHaveText("0");
  } finally {
    await other.close();
  }
});

test("개인 데모를 초기화해 두 홈 구성을 각각 재현하고 기존 캐시를 교체한다", async ({ page }) => {
  await login(page);
  let previousOwnerId = (await (await page.request.get("/api/workspace/contracts")).json()).ownerId;
  for (const variant of ["agenda-first", "risk-first"] as const) {
    await page.getByRole("link", { name: "체험 설정", exact: true }).click();
    await page.getByRole("combobox", { name: "체험할 홈 구성" }).selectOption(variant);
    await page.getByRole("checkbox", { name: "현재 체험 기록을 지우고 새로 시작합니다.", exact: true }).check();
    await page.getByRole("button", { name: "선택한 구성으로 새로 시작", exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator(".briefing-column > section").first().getByRole("heading", { level: 2 })).toHaveText(variant === "agenda-first" ? "운영 일정" : "계약 만료가 가까워요");
    const after = await (await page.request.get("/api/workspace/contracts")).json();
    expect(after.ownerId).not.toBe(previousOwnerId);
    previousOwnerId = after.ownerId;
    expect(after.data).toHaveLength(25);
    expect((await (await page.request.get("/api/workspace/messages")).json()).data).toEqual([]);
  }
});

test("모바일에서 실제 화면을 탐색하고 로그아웃 후 업무 API를 차단한다", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 850 });
  await login(page);
  const nav = page.getByRole("navigation", { name: "모바일 주요 메뉴" });
  await nav.getByRole("link", { name: "계약", exact: true }).click();
  await expect(page.locator(".contract-row")).toHaveCount(25);
  await nav.getByRole("link", { name: "메시지", exact: true }).click();
  await expect(page.getByRole("heading", { name: "안전한 메시지 보내기" })).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 393);
  await page.getByRole("link", { name: "체험 설정", exact: true }).click();
  const settingsTitle = page.getByRole("heading", { name: "개인 데모 관리", exact: true });
  await expect(settingsTitle).toBeInViewport();
  const [headerBox, titleBox] = await Promise.all([
    page.getByRole("banner").boundingBox(),
    settingsTitle.boundingBox(),
  ]);
  expect(headerBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect(titleBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
  await nav.getByRole("link", { name: "메시지", exact: true }).click();
  await expect(page.getByRole("heading", { name: "안전한 메시지 보내기" })).toBeVisible();
  await page.getByLabel("현재 계정과 데모 전환").getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/workspace/contracts")).status()).toBe(401);
});


test("모바일 장부, 검색 초기화와 일정 변경을 실제 화면에서 처리한다", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 850 });
  await login(page);
  await page.goto("/app/ledger");
  await page.getByRole("button", { name: "미납 1건 보기", exact: true }).click();
  const row = page.locator(".ledger-table tbody tr");
  await expect(row).toHaveCount(1);
  const payment = row.getByRole("button", { name: "입금 확인", exact: true });
  await expect(payment).toBeInViewport();
  const box = await payment.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(393);
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 393);
  const ledger = (await (await page.request.get("/api/workspace/ledger")).json()).data;
  const paid = ledger.find((charge: { status: string }) => charge.status === "paid");
  const invalid = await page.request.post("/api/operations", { data: { type: "send_overdue_notice", chargeId: paid.id } });
  expect(invalid.status()).toBe(409);

  await page.goto("/app/contracts");
  await page.getByRole("searchbox", { name: "호실 또는 임차인 검색" }).fill("존재하지않는이름");
  await expect(page.getByText("검색 결과가 없어요.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "검색 초기화" }).click();
  await expect(page.locator(".contract-row")).toHaveCount(25);

  await page.goto("/app/maintenance");
  await page.getByRole("button", { name: "방문 일정 정하기", exact: true }).click();
  const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 86_400_000));
  await page.getByLabel("방문 날짜와 시간").fill(`${tomorrow}T14:00`);
  await page.getByRole("button", { name: "방문 일정 저장", exact: true }).click();
  await page.getByRole("button", { name: "방문 일정 변경", exact: true }).click();
  await page.getByLabel("방문 날짜와 시간").fill(`${tomorrow}T16:00`);
  await page.getByRole("button", { name: "방문 일정 저장", exact: true }).click();
  await expect(page.getByRole("button", { name: "방문 일정 변경", exact: true })).toBeVisible();
  await page.reload();
  const requests = (await (await page.request.get("/api/workspace/maintenance")).json()).data;
  expect(requests[0].scheduledAt).toBe(`${tomorrow}T07:00:00.000Z`);
});

for (const width of [393, 1440]) {
  test(`실제 Chromium ${width}px에서 핵심 화면의 색 대비와 접근성을 검사한다`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 1000 });
    await login(page);
    for (const path of ["/app", "/app/ledger", "/app/contracts", "/app/maintenance", "/app/messages", "/app/settings"]) {
      await page.goto(path);
      await expect(page.locator("#main-content h1")).toBeVisible();
      await expect(page.locator(".route-state")).toHaveCount(0);
      await page.addScriptTag({ content: axe.source });
      const violations = await page.evaluate(async () => {
        const engine = (window as unknown as { axe: typeof axe }).axe;
        const result = await engine.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
        return result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
      });
      expect.soft(violations, `${path} at ${width}px`).toEqual([]);
      expect.soft(await page.locator("body").evaluate((body) => body.scrollWidth), path).toBeLessThanOrEqual(width);
    }
    if (width === 1440) {
      await page.goto("/app/ledger");
      await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
      await page.getByRole("button", { name: "미납 1건 보기", exact: true }).click();
      const payment = page.getByRole("button", { name: "입금 확인", exact: true });
      await payment.scrollIntoViewIfNeeded();
      await expect(payment).toBeVisible();
      expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(1440);
      await payment.click();
      await expect(page.getByText("203호의 입금을 확인하고 납부 완료로 반영했어요.", { exact: true })).toBeVisible();
    }
  });
}
