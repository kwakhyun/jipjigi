import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { closeDatabase, getDatabase } from "@/lib/db/client";
import { getDashboardSnapshot, getGrowthOverview, getWebVitalsOverview, listContracts, listLedger, listMaintenance, listMessages } from "@/lib/data/repository";
import { runOperation } from "@/lib/operations/service";
import { recordServerProductEvent } from "@/lib/analytics/server";
import { recordWebVital } from "@/lib/performance/server";
import { demoDates } from "./scenario";
import { DEMO_LIFETIME_MS, MAX_DEMO_WORKSPACES, enterDemoWorkspace, restartDemoWorkspace, type DemoWorkspace } from "./workspace";

let first: DemoWorkspace;
let second: DemoWorkspace;
beforeAll(async () => {
  vi.stubEnv("ALLOW_DEMO_AUTH", "true");
  first = await enterDemoWorkspace();
  second = await enterDemoWorkspace();
  // Cold-starting the WASM PostgreSQL engine can exceed Vitest's 10s hook
  // default on a busy host; keep setup bounded by the existing 30s test budget.
}, 30_000);
afterAll(async () => { await closeDatabase(); vi.unstubAllEnvs(); });

describe("브라우저별 개인 데모 작업공간", () => {
  it("두 방문자에 서로 다른 25개 계약을 만들고 역할 전환 때 같은 공간을 재사용한다", async () => {
    expect(first.id).not.toBe(second.id);
    expect(await enterDemoWorkspace(first.id)).toEqual(first);
    const a = await listContracts(first.ownerId);
    const b = await listContracts(second.ownerId);
    expect(a).toHaveLength(25);
    expect(b).toHaveLength(25);
    expect(a.some((row) => b.some((other) => other.id === row.id))).toBe(false);
    expect(await listContracts(first.operatorId)).toEqual([]);
    expect((await getDashboardSnapshot(first.ownerId)).briefing.renewal?.daysLeft).toBe(28);
    expect((await listLedger(first.ownerId))[0]?.period).toBe(demoDates(new Date()).period);
  });

  it("다른 공간의 리소스 변경은 거부하고 자신의 수리 완료만 반영한다", async () => {
    const request = (await listMaintenance(first.ownerId))[0]!;
    await expect(runOperation(second.ownerId, { type: "update_maintenance", requestId: request.id, status: "completed" })).rejects.toThrow("수리 요청을 찾을 수 없습니다.");
    await runOperation(first.ownerId, { type: "update_maintenance", requestId: request.id, status: "completed" });
    expect((await listMaintenance(first.ownerId))[0]?.status).toBe("completed");
    expect((await listMaintenance(second.ownerId))[0]?.status).toBe("received");
  });

  it("제품 이벤트, 실험 배정, CRM과 RUM을 해당 공간의 계정으로만 집계한다", async () => {
    await recordServerProductEvent("page_viewed", first.ownerId, "/app", {});
    const requestId = (await listMaintenance(first.ownerId))[0]!.id;
    await recordServerProductEvent("experiment_exposed", first.ownerId, "/app", {
      experiment_key: "home_briefing_priority_v1", variant: first.variant, risk_type: "maintenance_urgent", risk_signal_id: requestId,
    });
    await recordServerProductEvent("maintenance_updated", first.ownerId, "/app/maintenance", { request_id: requestId, outcome: "completed" });
    await recordWebVital({
      id: randomUUID(), metricId: randomUUID(), name: "LCP", value: 1234, delta: 1234,
      rating: "good", navigationType: "navigate", path: "/app", anonymousId: "demo-test-browser", sessionId: "demo-test-session", occurredAt: new Date().toISOString(),
    }, first.ownerId);
    const renewal = (await listContracts(first.ownerId)).find((contract) => contract.renewalStatus === "attention")!;
    await runOperation(first.ownerId, { type: "start_renewal", leaseId: renewal.id });
    const a = await getGrowthOverview(first.ownerId);
    const b = await getGrowthOverview(second.ownerId);
    expect(a.eventCounts.find((row) => row.name === "page_viewed")?.count).toBe(1);
    expect(a.experimentResults).toEqual([{ variant: first.variant, exposedUsers: 1, actionUsers: 1 }]);
    expect(b.eventCounts).toEqual([]);
    expect(b.experimentResults).toEqual([]);
    expect(b.assignmentCounts).toEqual([{ variant: second.variant, count: 1 }]);
    expect(a.messageStats.reduce((total, item) => total + item.count, 0)).toBe(1);
    expect(b.messageStats).toEqual([]);
    expect((await getWebVitalsOverview([first.ownerId, first.operatorId])).sampleCount).toBe(1);
    expect((await getWebVitalsOverview([second.ownerId, second.operatorId])).sampleCount).toBe(0);
  });

  it("타인 공간 초기화는 거부하고 본인 초기화는 새 ID와 깨끗한 데이터로 교체한다", async () => {
    await expect(restartDemoWorkspace(first.id, second.ownerId, "agenda-first")).rejects.toMatchObject({ code: "NOT_OWNED" });
    const previous = first;
    first = await restartDemoWorkspace(first.id, first.ownerId, "agenda-first");
    expect(first.id).not.toBe(previous.id);
    expect(first.variant).toBe("agenda-first");
    expect((await listMaintenance(first.ownerId))[0]?.status).toBe("received");
    expect(await listContracts(previous.ownerId)).toEqual([]);
    expect(await listMessages(first.ownerId)).toEqual([]);
    expect((await getGrowthOverview(first.ownerId)).eventCounts).toEqual([]);
    expect(await listContracts(second.ownerId)).toHaveLength(25);
  });

  it("만료된 공간을 재사용하지 않고 오래된 데모 데이터만 정리한다", async () => {
    const db = await getDatabase();
    const stale = first;
    await db.prepare("UPDATE demo_workspaces SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1).toISOString(), stale.id);
    first = await enterDemoWorkspace(stale.id);
    expect(first.id).not.toBe(stale.id);
    expect(Date.parse(first.expiresAt) - Date.parse(first.createdAt)).toBe(DEMO_LIFETIME_MS);
    expect(await listContracts(stale.ownerId)).toEqual([]);
    expect(await listContracts(second.ownerId)).toHaveLength(25);
    expect(await listContracts("owner-1")).toHaveLength(25);
  });

  it("공간 상한에 도달하면 활성 사용자의 데이터를 지우지 않고 생성을 거부한다", async () => {
    const db = await getDatabase();
    const current = await db.prepare("SELECT COUNT(*)::int AS count FROM demo_workspaces").get<{ count: number }>();
    await db.transaction(async (transaction) => {
      for (let index = current!.count; index < MAX_DEMO_WORKSPACES; index++) {
        const id = randomUUID();
        const owner = `cap-owner-${id}`;
        const operator = `cap-operator-${id}`;
        await transaction.prepare("INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, '테스트', '!', 'owner', ?), (?, ?, '테스트', '!', 'operator', ?)")
          .run(owner, `${owner}@invalid.test`, first.createdAt, operator, `${operator}@invalid.test`, first.createdAt);
        await transaction.prepare("INSERT INTO demo_workspaces (id, owner_id, operator_id, variant, created_at, expires_at) VALUES (?, ?, ?, 'risk-first', ?, ?)")
          .run(id, owner, operator, first.createdAt, first.expiresAt);
      }
    });
    await expect(enterDemoWorkspace()).rejects.toThrow("현재 체험 공간이 가득 찼어요");
    expect(await enterDemoWorkspace(second.id)).toEqual(second);
    expect(await listContracts(second.ownerId)).toHaveLength(25);
  });
});

describe("연도나 월에 고정되지 않는 데모 날짜", () => {
  it.each([
    ["2026-08-31T15:10:00.000Z", "2026-09", "2026-09-29"],
    ["2027-12-31T15:10:00.000Z", "2028-01", "2028-01-29"],
    ["2028-02-28T15:10:00.000Z", "2028-02", "2028-03-28"],
  ])("%s에도 한국 날짜로 청구월과 D-28 계약을 만든다", (now, period, renewalDate) => {
    const dates = demoDates(new Date(now));
    expect(dates.period).toBe(period);
    expect(dates.renewalDate).toBe(renewalDate);
    expect(Date.parse(dates.today) - Date.parse(dates.dueDate)).toBe(5 * 86_400_000);
  });
});
