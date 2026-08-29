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
