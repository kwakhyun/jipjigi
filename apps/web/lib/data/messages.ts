import "server-only";
import { getDatabase } from "@/lib/db/client";
import type { MessageRow } from "./types";

export async function listMessages(userId: string) {
  const database = await getDatabase();
  return database
    .prepare(
      `SELECT id, entity_type AS entityType, entity_id AS entityId, channel,
        template_key AS templateKey, status, guardrail_reason AS guardrailReason,
        scheduled_for AS scheduledFor, created_at AS createdAt, updated_at AS updatedAt,
        delivered_at AS deliveredAt, retry_count AS retryCount
       FROM message_dispatches WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .all<MessageRow>(userId);
}
