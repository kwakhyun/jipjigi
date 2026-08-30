import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { signWebhook } from "@/lib/messaging/webhook";

vi.mock("server-only", () => ({}));

let temporaryDirectory = "";
let getDatabase: typeof import("@/lib/db/client").getDatabase;
let closeDatabase: typeof import("@/lib/db/client").closeDatabase;
let runOperation: typeof import("@/lib/operations/service").runOperation;
let recordProductEvent: typeof import("@/lib/analytics/server").recordProductEvent;
let messageWebhook: typeof import("./route").POST;
let renewalResponseWebhook: typeof import("../renewal-responses/route").POST;

beforeAll(async () => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jipjigi-webhook-test-"));
  process.env.DB_DIR = path.join(temporaryDirectory, "jipjigi-pg");
  process.env.ALLOW_DEMO_AUTH = "true";
  process.env.MESSAGE_WEBHOOK_SECRET = "test-webhook-secret";
  process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567890";
  ({ getDatabase, closeDatabase } = await import("@/lib/db/client"));
  ({ runOperation } = await import("@/lib/operations/service"));
  ({ recordProductEvent } = await import("@/lib/analytics/server"));
  ({ POST: messageWebhook } = await import("./route"));
  ({ POST: renewalResponseWebhook } = await import("../renewal-responses/route"));
});

afterAll(async () => {
  await closeDatabase();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  delete process.env.DB_DIR;
  delete process.env.ALLOW_DEMO_AUTH;
  delete process.env.MESSAGE_WEBHOOK_SECRET;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
});

function signedRequest(url: string, value: unknown) {
  const body = JSON.stringify(value);
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-jipjigi-signature": signWebhook(body, process.env.MESSAGE_WEBHOOK_SECRET ?? ""),
    },
    body,
  });
}

describe("CRM 공급자 웹훅", () => {
  it("전달, 갱신 응답과 수신 해제를 계약 타임라인과 제품 이벤트에 저장한다", async () => {
    const result = await runOperation("owner-1", { type: "start_renewal", leaseId: "lease-seongsu-501" });
    if (!("id" in result)) throw new Error("메시지 결과가 필요합니다.");
    const providerMessageId = "provider-renewal-e2e";
    const database = await getDatabase();
    await database.prepare(
      "UPDATE message_dispatches SET status = 'accepted', provider_message_id = ? WHERE id = ?",
    ).run(providerMessageId, result.id);

    const deliveredAt = new Date().toISOString();
    const deliveryResponse = await messageWebhook(signedRequest("http://localhost/api/webhooks/messages", {
      providerMessageId,
      status: "delivered",
      occurredAt: deliveredAt,
    }));
    expect(deliveryResponse.status).toBe(200);

    const renewalResponse = await renewalResponseWebhook(signedRequest("http://localhost/api/webhooks/renewal-responses", {
      providerMessageId,
      response: "agreed",
      occurredAt: new Date(Date.now() + 1_000).toISOString(),
    }));
    expect(renewalResponse.status).toBe(200);

    const optOutResponse = await messageWebhook(signedRequest("http://localhost/api/webhooks/messages", {
      providerMessageId,
      status: "opted_out",
      occurredAt: new Date(Date.now() + 2_000).toISOString(),
    }));
    expect(optOutResponse.status).toBe(200);

    const lease = await database.prepare(
      "SELECT renewal_status AS renewalStatus, contact_consent AS contactConsent FROM leases WHERE id = ?",
    ).get<{ renewalStatus: string; contactConsent: number }>("lease-seongsu-501");
    expect(lease).toEqual({ renewalStatus: "agreed", contactConsent: 0 });
    const timeline = await database.prepare(
      "SELECT response FROM renewal_response_events WHERE lease_id = ?",
    ).get<{ response: string }>("lease-seongsu-501");
    expect(timeline?.response).toBe("agreed");
    const eventNames = await database.prepare(
      "SELECT name FROM product_events WHERE user_id = ? ORDER BY occurred_at",
    ).all<{ name: string }>("owner-1");
    expect(eventNames.map((event) => event.name)).toEqual(expect.arrayContaining([
      "crm_message_delivery_updated",
      "renewal_response_recorded",
      "crm_opted_out",
    ]));
  });

  it("클라이언트가 보낸 값 대신 서버 릴리스 버전을 저장한다", async () => {
    const eventId = crypto.randomUUID();
    await recordProductEvent({
      eventId,
      name: "page_viewed",
      anonymousId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      path: "/app",
      occurredAt: new Date().toISOString(),
      context: {
        releaseVersion: "spoofed-client-release",
        experimentKey: null,
        variant: null,
        userSegment: "unknown",
      },
      properties: {},
    }, "owner-1");

    const database = await getDatabase();
    const stored = await database.prepare(
      "SELECT release_version AS releaseVersion, user_segment AS userSegment FROM product_events WHERE id = ?",
    ).get<{ releaseVersion: string; userSegment: string }>(eventId);
    expect(stored).toEqual({ releaseVersion: "abcdef123456", userSegment: "owner" });
  });
});
