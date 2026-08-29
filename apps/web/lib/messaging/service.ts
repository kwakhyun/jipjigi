import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/db/client";
import { writeAudit } from "@/lib/data/repository";
import { evaluateGuardrails } from "./guardrails";

type DispatchInput = {
  userId: string;
  entityType: "charge" | "lease";
  entityId: string;
  templateKey: "overdue_notice_v1" | "renewal_check_v1";
  idempotencyKey: string;
};

type DispatchResult = {
  id: string;
  status: "scheduled" | "accepted" | "blocked";
  guardrailReason: string | null;
  scheduledFor: string | null;
  duplicate: boolean;
};

function sandboxProviderId(dispatchId: string) {
  const digest = createHash("sha256").update(dispatchId).digest("hex").slice(0, 16);
  return `sandbox_${digest}`;
}

export function dispatchTransactionalMessage(input: DispatchInput): DispatchResult {
  const db = getDatabase();
  const duplicate = db
    .prepare(
      `SELECT id, status, guardrail_reason AS guardrailReason, scheduled_for AS scheduledFor
       FROM message_dispatches WHERE idempotency_key = ? AND user_id = ?`,
    )
    .get(input.idempotencyKey, input.userId) as Omit<DispatchResult, "duplicate"> | undefined;
  if (duplicate) return { ...duplicate, duplicate: true };

  const contact = db
    .prepare(
      input.entityType === "charge"
        ? `SELECT l.contact_consent AS consent
           FROM charges c JOIN leases l ON l.id = c.lease_id
           JOIN units u ON u.id = l.unit_id JOIN buildings b ON b.id = u.building_id
           WHERE c.id = ? AND b.owner_id = ?`
        : `SELECT l.contact_consent AS consent
           FROM leases l JOIN units u ON u.id = l.unit_id JOIN buildings b ON b.id = u.building_id
           WHERE l.id = ? AND b.owner_id = ?`,
    )
    .get(input.entityId, input.userId) as { consent: 0 | 1 } | undefined;
  if (!contact) throw new Error("ENTITY_NOT_FOUND");

  const preferences = db
    .prepare(
      `SELECT quiet_hours_start AS quietHoursStart, quiet_hours_end AS quietHoursEnd
       FROM notification_preferences WHERE user_id = ?`,
    )
    .get(input.userId) as { quietHoursStart: string; quietHoursEnd: string };
  const recent = db
    .prepare(
      `SELECT COUNT(*) AS count FROM message_dispatches
       WHERE user_id = ? AND entity_type = ? AND entity_id = ?
         AND status IN ('scheduled', 'accepted', 'delivered')
         AND created_at >= datetime('now', '-7 days')`,
    )
    .get(input.userId, input.entityType, input.entityId) as { count: number };

  const decision = evaluateGuardrails({
    consent: contact.consent === 1,
    recentDispatchCount: recent.count,
    now: new Date(),
    quietHoursStart: preferences.quietHoursStart,
    quietHoursEnd: preferences.quietHoursEnd,
  });
  const id = randomUUID();
  const now = new Date().toISOString();
  const status = decision.outcome === "allowed" ? "accepted" : decision.outcome;
  const guardrailReason = decision.outcome === "allowed" ? null : decision.reason;
  const scheduledFor = decision.outcome === "scheduled" ? decision.scheduledFor : null;
  const providerMessageId = status === "accepted" ? sandboxProviderId(id) : null;

  db.prepare(
    `INSERT INTO message_dispatches (
      id, user_id, entity_type, entity_id, channel, template_key, idempotency_key,
      status, guardrail_reason, scheduled_for, provider_message_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.userId,
    input.entityType,
    input.entityId,
    "sandbox_alimtalk",
    input.templateKey,
    input.idempotencyKey,
    status,
    guardrailReason,
    scheduledFor,
    providerMessageId,
    now,
    now,
  );

  if (input.entityType === "lease" && status !== "blocked") {
    db.prepare("UPDATE leases SET renewal_status = 'requested' WHERE id = ?").run(input.entityId);
  }
  writeAudit(
    input.userId,
    input.entityType === "lease" ? "renewal_started" : "overdue_notice_sent",
    input.entityType,
    input.entityId,
    { status, guardrail: guardrailReason ?? "passed" },
  );
  return { id, status, guardrailReason, scheduledFor, duplicate: false };
}
