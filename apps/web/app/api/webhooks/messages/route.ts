import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { verifyWebhookSignature } from "@/lib/messaging/webhook";

const WebhookSchema = z.object({
  providerMessageId: z.string().min(1),
  status: z.enum(["delivered", "failed"]),
  occurredAt: z.string().datetime(),
});

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifyWebhookSignature(body, request.headers.get("x-rentflow-signature"), process.env.MESSAGE_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "서명이 유효하지 않습니다." }, { status: 401 });
  }
  try {
    const event = WebhookSchema.parse(JSON.parse(body));
    const result = getDatabase()
      .prepare(
        `UPDATE message_dispatches SET status = ?, updated_at = ?
         WHERE provider_message_id = ?`,
      )
      .run(event.status, event.occurredAt, event.providerMessageId);
    if (result.changes === 0) return NextResponse.json({ error: "메시지를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "웹훅 본문이 유효하지 않습니다." }, { status: 400 });
  }
}
