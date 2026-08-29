import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let temporaryDirectory = "";
let getDatabase: typeof import("@/lib/db/client").getDatabase;
let runOperation: typeof import("./service").runOperation;

beforeAll(async () => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jipjigi-operation-test-"));
  process.env.DB_FILE = path.join(temporaryDirectory, "jipjigi.db");
  process.env.ALLOW_DEMO_AUTH = "true";
  ({ getDatabase } = await import("@/lib/db/client"));
  ({ runOperation } = await import("./service"));
});

afterAll(() => {
  getDatabase().close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  delete process.env.DB_FILE;
  delete process.env.ALLOW_DEMO_AUTH;
});

describe("수리 방문 일정 저장", () => {
  it("시간과 소유권을 검증한 뒤 일정과 감사 로그를 함께 저장한다", () => {
    expect(() => runOperation("owner-1", {
      type: "update_maintenance",
      requestId: "maintenance-302",
      status: "scheduled",
    })).toThrowError("방문 날짜와 시간을 선택해 주세요.");

    expect(() => runOperation("operator-1", {
      type: "update_maintenance",
      requestId: "maintenance-302",
      status: "scheduled",
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
    })).toThrowError("수리 요청을 찾을 수 없습니다.");

    const scheduledAt = new Date(Date.now() + 172_800_000).toISOString();
    expect(runOperation("owner-1", {
      type: "update_maintenance",
      requestId: "maintenance-302",
      status: "scheduled",
      scheduledAt,
    })).toEqual({ status: "scheduled", unchanged: false });

    const request = getDatabase()
      .prepare("SELECT status, scheduled_at AS scheduledAt FROM maintenance_requests WHERE id = ?")
      .get("maintenance-302") as { status: string; scheduledAt: string };
    const audit = getDatabase()
      .prepare("SELECT metadata_json AS metadataJson FROM audit_logs WHERE action = ? ORDER BY occurred_at DESC LIMIT 1")
      .get("maintenance_updated") as { metadataJson: string };

    expect(request).toEqual({ status: "scheduled", scheduledAt });
    expect(JSON.parse(audit.metadataJson)).toMatchObject({ status: "scheduled", scheduledAt });
  });
});

describe("CRM 멱등성과 재시도", () => {
  it("같은 청구월의 미납 안내를 하나의 서버 멱등 키로 합친다", () => {
    const first = runOperation("owner-1", {
      type: "send_overdue_notice",
      chargeId: "charge-2026-08-203",
    });
    const second = runOperation("owner-1", {
      type: "send_overdue_notice",
      chargeId: "charge-2026-08-203",
    });

    expect("id" in first && "id" in second && second.id).toBe("id" in first ? first.id : "");
    expect("duplicate" in first && first.duplicate).toBe(false);
    expect("duplicate" in second && second.duplicate).toBe(true);
    const rows = getDatabase().prepare(
      "SELECT idempotency_key AS idempotencyKey FROM message_dispatches WHERE entity_id = ?",
    ).all("charge-2026-08-203") as Array<{ idempotencyKey: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.idempotencyKey).toMatch(/^[a-f0-9]{64}$/);
  });

  it("실패한 메시지를 같은 기록에서 재접수하고 타임라인을 남긴다", () => {
    const first = runOperation("owner-1", {
      type: "start_renewal",
      leaseId: "lease-seongsu-501",
    });
    if (!("id" in first)) throw new Error("메시지 결과가 필요합니다.");
    getDatabase().prepare("UPDATE message_dispatches SET status = 'failed' WHERE id = ?").run(first.id);

    const retried = runOperation("owner-1", { type: "retry_message", messageId: first.id });
    expect(retried).toMatchObject({ id: first.id, retryCount: 1, duplicate: false });
    const timeline = getDatabase().prepare(
      "SELECT status, retry_count AS retryCount FROM message_delivery_events WHERE dispatch_id = ? ORDER BY received_at",
    ).all(first.id) as Array<{ status: string; retryCount: number }>;
    expect(timeline.at(-1)).toMatchObject({ retryCount: 1 });
    const audit = getDatabase().prepare(
      "SELECT metadata_json AS metadataJson FROM audit_logs WHERE action = 'renewal_started' ORDER BY occurred_at DESC LIMIT 1",
    ).get() as { metadataJson: string };
    expect(JSON.parse(audit.metadataJson)).toMatchObject({ templateVersion: "v1", consentSnapshot: "granted" });
  });
});
