import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let temporaryDirectory = "";
let getDatabase: typeof import("@/lib/db/client").getDatabase;
let closeDatabase: typeof import("@/lib/db/client").closeDatabase;
let runOperation: typeof import("./service").runOperation;

beforeAll(async () => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jipjigi-operation-test-"));
  process.env.DB_DIR = path.join(temporaryDirectory, "jipjigi-pg");
  process.env.ALLOW_DEMO_AUTH = "true";
  ({ getDatabase, closeDatabase } = await import("@/lib/db/client"));
  ({ runOperation } = await import("./service"));
});

afterAll(async () => {
  await closeDatabase();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  delete process.env.DB_DIR;
  delete process.env.ALLOW_DEMO_AUTH;
});

describe("수리 방문 일정 저장", () => {
  it("시간과 소유권을 검증한 뒤 일정과 감사 로그를 함께 저장한다", async () => {
    await expect(runOperation("owner-1", {
      type: "update_maintenance",
      requestId: "maintenance-302",
      status: "scheduled",
    })).rejects.toThrowError("방문 날짜와 시간을 선택해 주세요.");

    await expect(runOperation("operator-1", {
      type: "update_maintenance",
      requestId: "maintenance-302",
      status: "scheduled",
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
    })).rejects.toThrowError("수리 요청을 찾을 수 없습니다.");

    const scheduledAt = new Date(Date.now() + 172_800_000).toISOString();
    await expect(runOperation("owner-1", {
      type: "update_maintenance",
      requestId: "maintenance-302",
      status: "scheduled",
      scheduledAt,
    })).resolves.toEqual({ status: "scheduled", unchanged: false });

    const database = await getDatabase();
    const request = await database
      .prepare("SELECT status, scheduled_at AS scheduledAt FROM maintenance_requests WHERE id = ?")
      .get<{ status: string; scheduledAt: string }>("maintenance-302");
    const audit = await database
      .prepare("SELECT metadata_json AS metadataJson FROM audit_logs WHERE action = ? ORDER BY occurred_at DESC LIMIT 1")
      .get<{ metadataJson: string }>("maintenance_updated");

    expect(request).toEqual({ status: "scheduled", scheduledAt });
    expect(JSON.parse(audit?.metadataJson ?? "{}" )).toMatchObject({ status: "scheduled", scheduledAt });
  });
});

describe("CRM 멱등성과 재시도", () => {
  it("같은 청구월의 미납 안내를 하나의 서버 멱등 키로 합친다", async () => {
    const first = await runOperation("owner-1", {
      type: "send_overdue_notice",
      chargeId: "charge-2026-08-203",
    });
    const second = await runOperation("owner-1", {
      type: "send_overdue_notice",
      chargeId: "charge-2026-08-203",
    });

    expect("id" in first && "id" in second && second.id).toBe("id" in first ? first.id : "");
    expect("duplicate" in first && first.duplicate).toBe(false);
    expect("duplicate" in second && second.duplicate).toBe(true);
    const database = await getDatabase();
    const rows = await database.prepare(
      "SELECT idempotency_key AS idempotencyKey FROM message_dispatches WHERE entity_id = ?",
    ).all<{ idempotencyKey: string }>("charge-2026-08-203");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.idempotencyKey).toMatch(/^[a-f0-9]{64}$/);
  });

  it("실패한 메시지를 같은 기록에서 재접수하고 타임라인을 남긴다", async () => {
    const first = await runOperation("owner-1", {
      type: "start_renewal",
      leaseId: "lease-seongsu-501",
    });
    if (!("id" in first)) throw new Error("메시지 결과가 필요합니다.");
    const database = await getDatabase();
    await database.prepare("UPDATE message_dispatches SET status = 'failed' WHERE id = ?").run(first.id);

    const retried = await runOperation("owner-1", { type: "retry_message", messageId: first.id });
    expect(retried).toMatchObject({ id: first.id, retryCount: 1, duplicate: false });
    const timeline = await database.prepare(
      "SELECT status, retry_count AS retryCount FROM message_delivery_events WHERE dispatch_id = ? ORDER BY received_at",
    ).all<{ status: string; retryCount: number }>(first.id);
    expect(timeline.at(-1)).toMatchObject({ retryCount: 1 });
    const audit = await database.prepare(
      "SELECT metadata_json AS metadataJson FROM audit_logs WHERE action = 'renewal_started' ORDER BY occurred_at DESC LIMIT 1",
    ).get<{ metadataJson: string }>();
    expect(JSON.parse(audit?.metadataJson ?? "{}")).toMatchObject({ templateVersion: "v1", consentSnapshot: "granted" });
  });
});
