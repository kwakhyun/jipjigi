import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AppDatabase, closeDatabase, getDatabase } from "@/lib/db/client";
import { runOperation } from "./service";

let db: AppDatabase;
const chargeId = "charge-2026-08-203";
beforeAll(async () => { db = await getDatabase(); });
beforeEach(async () => {
  await db.exec("DELETE FROM message_delivery_events; DELETE FROM message_dispatches; DELETE FROM audit_logs; DELETE FROM product_events;");
  await db.prepare("UPDATE charges SET status = 'overdue', paid_at = NULL WHERE id = ?").run(chargeId);
  await db.prepare("UPDATE maintenance_requests SET status = 'received', scheduled_at = NULL, completed_at = NULL WHERE id = 'maintenance-302'").run();
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await closeDatabase(); });

async function count(table: string) {
  return (await db.prepare(`SELECT COUNT(*)::int AS count FROM ${table}`).get<{ count: number }>())?.count;
}

describe("업무 상태와 기록의 원자성", () => {
  it.each(["paid", "upcoming"])("%s 청구에는 미납 안내를 접수하지 않는다", async (status) => {
    await db.prepare("UPDATE charges SET status = ? WHERE id = ?").run(status, chargeId);
    await expect(runOperation("owner-1", { type: "send_overdue_notice", chargeId })).rejects.toMatchObject({ code: "TARGET_CHANGED", status: 409 });
    expect(await count("message_dispatches")).toBe(0);
    expect(await count("audit_logs")).toBe(0);
  });

  it("입금 확인 동시 요청은 상태 변경과 성공 로그를 한 번만 남긴다", async () => {
    const results = await Promise.all(Array.from({ length: 3 }, () => runOperation("owner-1", { type: "mark_payment", chargeId })));
    expect(results.filter((result) => "unchanged" in result && !result.unchanged)).toHaveLength(1);
    expect(await count("audit_logs")).toBe(1);
    expect(await count("product_events")).toBe(1);
  });

  it("메시지 동시 접수와 재시도는 같은 기록에서 한 번씩만 처리한다", async () => {
    const results = await Promise.all(Array.from({ length: 3 }, () => runOperation("owner-1", { type: "send_overdue_notice", chargeId })));
    const first = results[0];
    if (!first || !("id" in first)) throw new Error("dispatch expected");
    expect(new Set(results.map((result) => "id" in result ? result.id : "" )).size).toBe(1);
    expect(await count("message_dispatches")).toBe(1);
    expect(await count("message_delivery_events")).toBe(1);
    expect(await count("audit_logs")).toBe(1);
    await db.prepare("UPDATE message_dispatches SET status = 'failed' WHERE id = ?").run(first.id);
    const retries = await Promise.all(Array.from({ length: 2 }, () => runOperation("owner-1", { type: "retry_message", messageId: first.id })));
    expect(retries).toEqual(expect.arrayContaining([expect.objectContaining({ duplicate: false, retryCount: 1 }), expect.objectContaining({ duplicate: true, retryCount: 1 })]));
    expect(await count("message_delivery_events")).toBe(2);
    await db.prepare("UPDATE message_dispatches SET status = 'failed' WHERE id = ?").run(first.id);
    await runOperation("owner-1", { type: "mark_payment", chargeId });
    await expect(runOperation("owner-1", { type: "retry_message", messageId: first.id })).rejects.toMatchObject({ code: "TARGET_CHANGED" });
  });

  it.each(["mark_payment", "send_overdue_notice"] as const)("%s 감사 기록 실패 시 상태와 메시지, 이벤트를 모두 롤백한다", async (type) => {
    const query = AppDatabase.prototype.query;
    const fault = vi.spyOn(AppDatabase.prototype, "query").mockImplementation(function (this: AppDatabase, sql, params) {
      if (/INSERT INTO audit_logs/.test(sql)) return Promise.reject(new Error("audit unavailable"));
      return query.call(this, sql, params);
    });
    await expect(runOperation("owner-1", { type, chargeId })).rejects.toThrow("audit unavailable");
    fault.mockRestore();
    expect(await db.prepare("SELECT status FROM charges WHERE id = ?").get(chargeId)).toEqual({ status: "overdue" });
    for (const table of ["audit_logs", "message_dispatches", "message_delivery_events", "product_events"]) expect(await count(table)).toBe(0);
  });

  it("예약 일정을 변경할 수 있고 완료된 요청은 다시 예약되지 않는다", async () => {
    const schedule = (days: number) => ({ type: "update_maintenance" as const, requestId: "maintenance-302", status: "scheduled" as const, scheduledAt: new Date(Date.now() + days * 86_400_000).toISOString() });
    await runOperation("owner-1", schedule(1));
    const changed = schedule(2);
    expect(await runOperation("owner-1", changed)).toMatchObject({ unchanged: false });
    expect(await db.prepare("SELECT scheduled_at AS scheduledAt FROM maintenance_requests WHERE id = 'maintenance-302'").get()).toEqual({ scheduledAt: changed.scheduledAt });
    await runOperation("owner-1", { type: "update_maintenance", requestId: "maintenance-302", status: "completed" });
    await expect(runOperation("owner-1", schedule(3))).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});
