import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordServerProductEvent } from "@/lib/analytics/server";
import { writeAudit } from "@/lib/data/repository";
import { getDatabase } from "@/lib/db/client";
import { verifyWebhookSignature } from "@/lib/messaging/webhook";

const RenewalResponseSchema = z.object({
  providerMessageId: z.string().min(1),
  response: z.enum(["agreed", "declined"]),
  occurredAt: z.string().datetime(),
});

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifyWebhookSignature(body, request.headers.get("x-jipjigi-signature"), process.env.MESSAGE_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "서명이 유효하지 않습니다." }, { status: 401 });
  }
  try {
    const event = RenewalResponseSchema.parse(JSON.parse(body));
    const db = getDatabase();
    const dispatch = db.prepare(
      `SELECT id, user_id AS userId, entity_id AS leaseId
       FROM message_dispatches
       WHERE provider_message_id = ? AND entity_type = 'lease'`,
    ).get(event.providerMessageId) as { id: string; userId: string; leaseId: string } | undefined;
    if (!dispatch) return NextResponse.json({ error: "갱신 요청 메시지를 찾을 수 없습니다." }, { status: 404 });
    const inserted = db.prepare(
      `INSERT OR IGNORE INTO renewal_response_events (
        id, dispatch_id, lease_id, response, provider_occurred_at, received_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), dispatch.id, dispatch.leaseId, event.response, event.occurredAt, new Date().toISOString());
    if (inserted.changes === 0) return NextResponse.json({ received: true, duplicate: true });
    if (event.response === "agreed") db.prepare("UPDATE leases SET renewal_status = 'agreed' WHERE id = ?").run(dispatch.leaseId);
    writeAudit(dispatch.userId, "renewal_response_recorded", "lease", dispatch.leaseId, {
      messageId: dispatch.id,
      response: event.response,
    });
    recordServerProductEvent("renewal_response_recorded", dispatch.userId, "/api/webhooks/renewal-responses", {
      message_id: dispatch.id,
      lease_id: dispatch.leaseId,
      response: event.response,
      channel: "sandbox_alimtalk",
    });
    return NextResponse.json({ received: true, duplicate: false });
  } catch {
    return NextResponse.json({ error: "웹훅 본문이 유효하지 않습니다." }, { status: 400 });
  }
}
