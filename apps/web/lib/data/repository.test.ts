import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let temporaryDirectory = "";
let getDatabase: typeof import("@/lib/db/client").getDatabase;
let closeDatabase: typeof import("@/lib/db/client").closeDatabase;
let repository: typeof import("./repository");

beforeAll(async () => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jipjigi-repository-test-"));
  vi.stubEnv("DB_DIR", path.join(temporaryDirectory, "jipjigi-pg"));
  vi.stubEnv("ALLOW_DEMO_AUTH", "true");
  ({ getDatabase, closeDatabase } = await import("@/lib/db/client"));
  repository = await import("./repository");
});

afterAll(async () => {
  await closeDatabase();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("계약 관리와 메시지 센터의 PostgreSQL 조회", () => {
  it("발송 내역이 없는 초기 데이터에서도 두 화면의 조회가 성공한다", async () => {
    const [contracts, messages, charges] = await Promise.all([
      repository.listContracts("owner-1"),
      repository.listMessages("owner-1"),
      repository.listLedger("owner-1"),
    ]);
    expect(contracts).toHaveLength(25);
    expect(contracts.every((contract) => contract.timeline.length === 0)).toBe(true);
    expect(messages).toEqual([]);
    expect(charges).toHaveLength(25);
  });

  it("발송 이벤트와 갱신 응답을 합쳐 최신순으로 정렬하고 다른 계정에는 노출하지 않는다", async () => {
    const db = await getDatabase();
    const createdAt = "2026-08-30T01:00:00.000Z";
    await db.prepare(`INSERT INTO message_dispatches (
      id, user_id, entity_type, entity_id, channel, template_key, idempotency_key, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "dispatch-test", "owner-1", "lease", "lease-seongsu-501", "sandbox_alimtalk", "renewal", "timeline-test", "delivered", createdAt, createdAt,
    );
    for (let index = 0; index < 9; index += 1) {
      await db.prepare(`INSERT INTO message_delivery_events (
        id, dispatch_id, status, retry_count, provider_occurred_at, received_at
      ) VALUES (?, ?, ?, ?, ?, ?)`).run(
        `delivery-${index}`, "dispatch-test", "delivered", index, null, `2026-08-30T01:0${index}:00.000Z`,
      );
    }
    await db.prepare(`INSERT INTO renewal_response_events (
      id, dispatch_id, lease_id, response, provider_occurred_at, received_at
    ) VALUES (?, ?, ?, ?, ?, ?)`).run(
      "response-test", "dispatch-test", "lease-seongsu-501", "agreed", "2026-08-30T02:00:00.000Z", "2026-08-30T02:01:00.000Z",
    );

    const contracts = await repository.listContracts("owner-1");
    const timeline = contracts.find((contract) => contract.id === "lease-seongsu-501")?.timeline;
    expect(timeline).toHaveLength(8);
    expect(timeline?.[0]).toMatchObject({ id: "response-test", kind: "response", status: "agreed", occurredAt: "2026-08-30T02:00:00.000Z" });
    expect(timeline?.[1]).toMatchObject({ id: "delivery-8", kind: "message", retryCount: 8 });
    expect(contracts.find((contract) => contract.id === "lease-seongsu-203")?.timeline).toEqual([]);
    expect(await repository.listContracts("operator-1")).toEqual([]);
    expect(await repository.listMessages("operator-1")).toEqual([]);
  });
});

describe("브리핑과 그로스 지표의 문서 계약", () => {
  it("알림 표시 설정을 끄고 켤 때 홈만 바뀌고 원본 계약·장부는 유지한다", async () => {
    const original = await repository.getPreferences("owner-1");
    const settings = { rentReminder: false, renewalReminder: false, maintenanceUpdates: false, marketing: false, quietHoursStart: "22:00", quietHoursEnd: "09:00" };
    await repository.updatePreferences("owner-1", settings);
    const muted = await repository.getDashboardSnapshot("owner-1");
    expect(muted.briefing).toEqual({ renewal: null, overdue: null, maintenance: null });
    expect(muted.hasMutedBriefings).toBe(true);
    expect(muted.recentActivities).toEqual(expect.arrayContaining([expect.objectContaining({ label: "알림 설정 변경" })]));
    expect(await repository.getPreferences("owner-1")).toMatchObject({ quietHoursStart: "22:00", quietHoursEnd: "09:00" });
    expect(await repository.listContracts("owner-1")).toHaveLength(25);
    expect(await repository.listLedger("owner-1")).toHaveLength(25);
    await repository.updatePreferences("owner-1", { ...settings, rentReminder: true, renewalReminder: true, maintenanceUpdates: true, quietHoursStart: original!.quietHoursStart, quietHoursEnd: original!.quietHoursEnd });
    const restored = await repository.getDashboardSnapshot("owner-1");
    expect(restored.briefing.overdue).not.toBeNull();
    expect(restored.briefing.maintenance).not.toBeNull();
    expect(restored.hasMutedBriefings).toBe(false);
  });

  it("전달 전, 다른 채널, 미래 수신 해제를 제외하고 전달 이후의 계약만 집계한다", async () => {
    const db = await getDatabase();
    const now = new Date();
    const date = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
    await db.prepare("UPDATE message_dispatches SET delivered_at = ? WHERE id = ?").run(date(-3), "dispatch-test");
    await db.prepare("INSERT INTO crm_opt_outs (id, user_id, lease_id, channel, occurred_at) VALUES (?, ?, ?, ?, ?)").run("opt-audit", "owner-1", "lease-seongsu-501", "sandbox_alimtalk", date(-4));
    expect((await repository.getGrowthOverview()).crmGuardrails).toMatchObject({ deliveredRecipients: 1, optOuts: 0, optOutRate: 0 });
    await db.prepare("UPDATE crm_opt_outs SET occurred_at = ? WHERE id = ?").run(date(-2), "opt-audit");
    expect((await repository.getGrowthOverview()).crmGuardrails.optOutRate).toBe(100);
    await db.prepare("UPDATE crm_opt_outs SET channel = 'push' WHERE id = ?").run("opt-audit");
    expect((await repository.getGrowthOverview()).crmGuardrails.optOutRate).toBe(0);
    await db.prepare("UPDATE crm_opt_outs SET channel = 'sandbox_alimtalk', occurred_at = ? WHERE id = ?").run(date(1), "opt-audit");
    expect((await repository.getGrowthOverview()).crmGuardrails.optOutRate).toBe(0);
  });
});
