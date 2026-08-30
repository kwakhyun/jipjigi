import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordServerProductEvent } from "@/lib/analytics/server";
import { writeAudit } from "@/lib/data/repository";
import { getDatabase } from "@/lib/db/client";
import { verifyWebhookSignature } from "@/lib/messaging/webhook";

const WebhookSchema = z.object({
  providerMessageId: z.string().min(1),
  status: z.enum(["delivered", "failed", "opted_out"]),
  occurredAt: z.string().datetime(),
});

type DispatchRecord = {
  id: string;
  userId: string;
  entityType: "charge" | "lease";
  entityId: string;
  channel: string;
  status: "scheduled" | "accepted" | "delivered" | "blocked" | "failed";
  retryCount: number;
  updatedAt: string;
};

async function leaseIdForDispatch(dispatch: DispatchRecord) {
  if (dispatch.entityType === "lease") return dispatch.entityId;
  const database = await getDatabase();
  const charge = await database.prepare("SELECT lease_id AS leaseId FROM charges WHERE id = ?").get<{ leaseId: string }>(dispatch.entityId);
  return charge?.leaseId;
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifyWebhookSignature(body, request.headers.get("x-jipjigi-signature"), process.env.MESSAGE_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "서명이 유효하지 않습니다." }, { status: 401 });
  }
  try {
    const event = WebhookSchema.parse(JSON.parse(body));
    const db = await getDatabase();
    const dispatch = await db.prepare(
      `SELECT id, user_id AS userId, entity_type AS entityType, entity_id AS entityId,
        channel, status, retry_count AS retryCount, updated_at AS updatedAt
       FROM message_dispatches WHERE provider_message_id = ?`,
    ).get<DispatchRecord>(event.providerMessageId);
    if (!dispatch) return NextResponse.json({ error: "메시지를 찾을 수 없습니다." }, { status: 404 });

    if (event.status === "opted_out") {
      const leaseId = await leaseIdForDispatch(dispatch);
      if (!leaseId) return NextResponse.json({ error: "계약을 찾을 수 없습니다." }, { status: 404 });
      const inserted = await db.prepare(
        `INSERT OR IGNORE INTO crm_opt_outs (id, user_id, lease_id, channel, occurred_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(randomUUID(), dispatch.userId, leaseId, dispatch.channel, event.occurredAt);
      await db.prepare("UPDATE leases SET contact_consent = 0 WHERE id = ?").run(leaseId);
      if (inserted.changes > 0) {
        await writeAudit(dispatch.userId, "crm_opted_out", "lease", leaseId, { channel: dispatch.channel, messageId: dispatch.id });
        await recordServerProductEvent("crm_opted_out", dispatch.userId, "/api/webhooks/messages", {
          message_id: dispatch.id,
          lease_id: leaseId,
          channel: dispatch.channel,
          provider_status: event.status,
        });
      }
      return NextResponse.json({ received: true, duplicate: inserted.changes === 0 });
    }

    if (dispatch.status === event.status) return NextResponse.json({ received: true, duplicate: true });
    if (dispatch.status === "delivered" || Date.parse(event.occurredAt) < Date.parse(dispatch.updatedAt)) {
      return NextResponse.json({ received: true, stale: true });
    }
    await db.prepare(
      `UPDATE message_dispatches SET status = ?, delivered_at = CASE WHEN ? = 'delivered' THEN ? ELSE delivered_at END,
        updated_at = ? WHERE id = ?`,
    ).run(event.status, event.status, event.occurredAt, event.occurredAt, dispatch.id);
    await db.prepare(
      `INSERT INTO message_delivery_events (
        id, dispatch_id, status, retry_count, provider_occurred_at, received_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), dispatch.id, event.status, dispatch.retryCount, event.occurredAt, new Date().toISOString());
    await writeAudit(dispatch.userId, "message_delivery_updated", dispatch.entityType, dispatch.entityId, {
      messageId: dispatch.id,
      providerStatus: event.status,
      retryCount: dispatch.retryCount,
    });
    await recordServerProductEvent("crm_message_delivery_updated", dispatch.userId, "/api/webhooks/messages", {
      message_id: dispatch.id,
      [dispatch.entityType === "charge" ? "charge_id" : "lease_id"]: dispatch.entityId,
      channel: dispatch.channel,
      provider_status: event.status,
      retry_count: dispatch.retryCount,
    });
    return NextResponse.json({ received: true, duplicate: false });
  } catch {
    return NextResponse.json({ error: "웹훅 본문이 유효하지 않습니다." }, { status: 400 });
  }
}
