import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { type AppDatabase, closeDatabase, getDatabase } from "@/lib/db/client";
import { getWebVitalsOverview } from "@/lib/data/vitals";
import type { WebVitalPayload } from "./schema";
import { recordWebVital } from "./server";

let db: AppDatabase;

beforeAll(async () => { db = await getDatabase(); });
beforeEach(async () => { await db.prepare("DELETE FROM web_vitals").run(); });
afterAll(async () => { await closeDatabase(); });

function metric(overrides: Partial<WebVitalPayload> = {}): WebVitalPayload {
  return {
    id: randomUUID(),
    metricId: "document-metric-123",
    name: "INP",
    value: 80,
    delta: 80,
    rating: "good",
    navigationType: "navigate",
    path: "/app",
    anonymousId: "anonymous-123",
    sessionId: "session-123",
    occurredAt: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  };
}

async function storedMetrics() {
  return db.prepare(`SELECT id, user_id AS userId, anonymous_id AS anonymousId,
    session_id AS sessionId, name, value, delta, rating, path,
    navigation_type AS navigationType, occurred_at AS occurredAt, received_at AS receivedAt
    FROM web_vitals`).all();
}

describe("성능 지표의 후속 보고 저장", () => {
  it.each([
    { name: "INP" as const, firstValue: 80, finalValue: 640 },
    { name: "CLS" as const, firstValue: 0.05, finalValue: 0.4 },
  ])("같은 $name의 최신 값을 한 표본에 반영하고 최초 문서 귀속을 유지한다", async ({ name, firstValue, finalValue }) => {
    const first = metric({ name, value: firstValue, delta: firstValue });
    const latest = metric({ ...first, id: randomUUID(), value: finalValue,
      delta: finalValue - firstValue, rating: "poor", path: "/app/contracts",
      navigationType: "reload", occurredAt: new Date(Date.parse(first.occurredAt) + 10_000).toISOString() });

    await recordWebVital(first, "owner-1");
    await recordWebVital(latest, "owner-1");

    expect(await storedMetrics()).toEqual([expect.objectContaining({
      id: first.id, userId: "owner-1", name, value: finalValue,
      delta: latest.delta, rating: "poor", path: first.path,
      navigationType: first.navigationType, occurredAt: latest.occurredAt,
    })]);
    const overview = await getWebVitalsOverview(["owner-1"]);
    expect(overview.sampleCount).toBe(1);
    expect(overview.metrics.find((item) => item.name === name)).toMatchObject({
      p75: finalValue, goodRate: 0, sampleCount: 1,
    });
  });

  it("지연 도착하거나 같은 시각에 다시 온 보고는 최신 값을 덮어쓰지 않는다", async () => {
    const latest = metric({ value: 640, delta: 560, rating: "poor" });
    await recordWebVital(latest, "owner-1");
    const stored = await storedMetrics();

    await recordWebVital(metric({ occurredAt: new Date(Date.parse(latest.occurredAt) - 10_000).toISOString() }), "owner-1");
    await recordWebVital(metric({ occurredAt: latest.occurredAt }), "owner-1");
    await recordWebVital(latest, "owner-1");

    expect(await storedMetrics()).toEqual(stored);
  });

  it("동시 보고와 중복 요청에도 발생 시각이 가장 늦은 표본 하나만 남긴다", async () => {
    const first = metric();
    const second = metric({ value: 640, rating: "poor", occurredAt: new Date(Date.parse(first.occurredAt) + 5_000).toISOString() });
    const latest = metric({ value: 120, delta: -520, occurredAt: new Date(Date.parse(first.occurredAt) + 10_000).toISOString() });
    await Promise.all([second, latest, first, latest].map((report) => recordWebVital(report, "owner-1")));

    expect(await storedMetrics()).toEqual([expect.objectContaining({
      value: 120, delta: -520, rating: "good", occurredAt: latest.occurredAt,
    })]);
  });

  it.each<{
    label: string;
    initialUser: string | null;
    nextUser: string | null;
    changes: Partial<WebVitalPayload>;
  }>([
    { label: "다른 계정", initialUser: "owner-1", nextUser: "operator-1", changes: {} },
    { label: "로그아웃", initialUser: "owner-1", nextUser: null, changes: {} },
    { label: "익명 표본의 로그인", initialUser: null, nextUser: "owner-1", changes: {} },
    { label: "다른 익명 식별자", initialUser: "owner-1", nextUser: "owner-1", changes: { anonymousId: "anonymous-other" } },
    { label: "다른 세션", initialUser: "owner-1", nextUser: "owner-1", changes: { sessionId: "session-other" } },
  ])("$label 보고로 기존 표본의 값이나 신원을 바꾸지 않는다", async ({ initialUser, nextUser, changes }) => {
    const first = metric();
    await recordWebVital(first, initialUser);
    const stored = await storedMetrics();

    await recordWebVital(metric({ ...changes, value: 640, rating: "poor",
      occurredAt: new Date(Date.parse(first.occurredAt) + 10_000).toISOString() }), nextUser);

    expect(await storedMetrics()).toEqual(stored);
  });

  it("같은 익명 방문의 후속 보고는 갱신한다", async () => {
    const first = metric();
    await recordWebVital(first, null);
    await recordWebVital(metric({ value: 640, rating: "poor",
      occurredAt: new Date(Date.parse(first.occurredAt) + 10_000).toISOString() }), null);

    expect(await storedMetrics()).toEqual([expect.objectContaining({ userId: null, value: 640, rating: "poor" })]);
  });
});
