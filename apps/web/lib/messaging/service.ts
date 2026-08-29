import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { MessageDispatchOperationResult } from "@jipjigi/domain";
import { recordServerProductEvent } from "@/lib/analytics/server";
import { getDatabase } from "@/lib/db/client";
import { writeAudit } from "@/lib/data/repository";
import { evaluateGuardrails } from "./guardrails";

type DispatchInput = {
  userId: string;
  entityType: "charge" | "lease";
  entityId: string;
  templateKey: "overdue_notice_v1" | "renewal_check_v1";
};

type DispatchContext = {
  consent: 0 | 1;
  leaseId: string;
  billingPeriod: string | null;
};

type StoredDispatch = MessageDispatchOperationResult & {
  entityType: "charge" | "lease";
  entityId: string;
  templateKey: string;
};

export class MessageDispatchError extends Error {
  constructor(public readonly code: "NOT_FOUND" | "RETRY_NOT_ALLOWED", message: string) {
    super(message);
  }
}

function sandboxProviderId(dispatchId: string, retryCount = 0) {
  const digest = createHash("sha256").update(`${dispatchId}:${retryCount}`).digest("hex").slice(0, 16);
  return `sandbox_${digest}`;
}

function seoulDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function logicalIdempotencyKey(input: DispatchInput, context: DispatchContext, now: Date) {
  const businessWindow = input.entityType === "charge" ? context.billingPeriod : seoulDateKey(now);
  return createHash("sha256")
    .update([input.userId, input.templateKey, context.leaseId, businessWindow].join(":"))
    .digest("hex");
}

function dispatchContext(input: DispatchInput): DispatchContext {
  const db = getDatabase();
  const context = input.entityType === "charge"
    ? db.prepare(
        `SELECT l.contact_consent AS consent, l.id AS leaseId, c.period AS billingPeriod
         FROM charges c JOIN leases l ON l.id = c.lease_id
         JOIN units u ON u.id = l.unit_id JOIN buildings b ON b.id = u.building_id
         WHERE c.id = ? AND b.owner_id = ?`,
      ).get(input.entityId, input.userId)
    : db.prepare(
        `SELECT l.contact_consent AS consent, l.id AS leaseId, NULL AS billingPeriod
         FROM leases l JOIN units u ON u.id = l.unit_id JOIN buildings b ON b.id = u.building_id
         WHERE l.id = ? AND b.owner_id = ?`,
      ).get(input.entityId, input.userId);
  if (!context) throw new MessageDispatchError("NOT_FOUND", "메시지를 보낼 계약을 찾을 수 없습니다.");
  return context as DispatchContext;
}

function preferences(userId: string) {
  return getDatabase()
    .prepare(
      `SELECT quiet_hours_start AS quietHoursStart, quiet_hours_end AS quietHoursEnd
       FROM notification_preferences WHERE user_id = ?`,
    )
    .get(userId) as { quietHoursStart: string; quietHoursEnd: string };
}

function appendDeliveryEvent(dispatchId: string, status: StoredDispatch["status"], retryCount: number, providerOccurredAt: string | null = null) {
  getDatabase().prepare(
    `INSERT INTO message_delivery_events (
      id, dispatch_id, status, retry_count, provider_occurred_at, received_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), dispatchId, status, retryCount, providerOccurredAt, new Date().toISOString());
}

function storedDispatchByIdempotencyKey(userId: string, idempotencyKey: string) {
  return getDatabase().prepare(
    `SELECT id, entity_type AS entityType, entity_id AS entityId, template_key AS templateKey,
      status, guardrail_reason AS guardrailReason, scheduled_for AS scheduledFor,
      retry_count AS retryCount
     FROM message_dispatches WHERE idempotency_key = ? AND user_id = ?`,
  ).get(idempotencyKey, userId) as StoredDispatch | undefined;
}

function recentRenewalDispatch(userId: string, leaseId: string) {
  return getDatabase().prepare(
    `SELECT id, entity_type AS entityType, entity_id AS entityId, template_key AS templateKey,
      status, guardrail_reason AS guardrailReason, scheduled_for AS scheduledFor,
      retry_count AS retryCount
     FROM message_dispatches
     WHERE user_id = ? AND entity_type = 'lease' AND entity_id = ?
       AND status IN ('scheduled', 'accepted', 'delivered')
       AND created_at >= datetime('now', '-24 hours')
     ORDER BY created_at DESC LIMIT 1`,
  ).get(userId, leaseId) as StoredDispatch | undefined;
}

function recordDispatchEvents(input: DispatchInput, context: DispatchContext, result: StoredDispatch) {
  const entityProperty = input.entityType === "charge" ? { charge_id: input.entityId } : { lease_id: input.entityId };
  const common = {
    ...entityProperty,
    message_id: result.id,
    channel: "sandbox_alimtalk",
    outcome: result.status,
    template_version: "v1",
    consent_checked: context.consent === 1,
    quiet_hours_applied: result.status === "scheduled",
    ...(context.billingPeriod ? { billing_period: context.billingPeriod } : {}),
  };
  recordServerProductEvent("crm_message_requested", input.userId, "/app/messages", common);
  if (result.status === "blocked") {
    recordServerProductEvent("crm_guardrail_blocked", input.userId, "/app/messages", {
      ...common,
      reason: result.guardrailReason ?? "unknown",
    });
    return;
  }
  recordServerProductEvent(
    input.entityType === "charge" ? "overdue_notice_requested" : "renewal_started",
    input.userId,
    input.entityType === "charge" ? "/app/ledger" : "/app/contracts",
    common,
  );
}

export function dispatchTransactionalMessage(input: DispatchInput): MessageDispatchOperationResult {
  const db = getDatabase();
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const context = dispatchContext(input);
  const idempotencyKey = logicalIdempotencyKey(input, context, nowDate);
  const exactDuplicate = storedDispatchByIdempotencyKey(input.userId, idempotencyKey);
  if (exactDuplicate && exactDuplicate.status !== "blocked") return { ...exactDuplicate, duplicate: true };

  if (input.entityType === "lease") {
    const recent = recentRenewalDispatch(input.userId, context.leaseId);
    if (recent && recent.id !== exactDuplicate?.id) return { ...recent, duplicate: true };
  }

  const recent = db.prepare(
    `SELECT COUNT(*) AS count FROM message_dispatches
     WHERE user_id = ? AND entity_type = ? AND entity_id = ?
       AND status IN ('scheduled', 'accepted', 'delivered')
       AND created_at >= datetime('now', '-7 days')`,
  ).get(input.userId, input.entityType, input.entityId) as { count: number };
  const notificationPreferences = preferences(input.userId);
  const decision = evaluateGuardrails({
    consent: context.consent === 1,
    recentDispatchCount: recent.count,
    now: nowDate,
    ...notificationPreferences,
  });
  const status = decision.outcome === "allowed" ? "accepted" : decision.outcome;
  const guardrailReason = decision.outcome === "allowed" ? null : decision.reason;
  const scheduledFor = decision.outcome === "scheduled" ? decision.scheduledFor : null;

  if (exactDuplicate) {
    if (exactDuplicate.status === status && exactDuplicate.guardrailReason === guardrailReason) {
      return { ...exactDuplicate, duplicate: true };
    }
    const providerMessageId = status === "accepted" ? sandboxProviderId(exactDuplicate.id, exactDuplicate.retryCount) : null;
    db.prepare(
      `UPDATE message_dispatches SET status = ?, guardrail_reason = ?, scheduled_for = ?,
        provider_message_id = ?, consent_checked = ?, updated_at = ? WHERE id = ?`,
    ).run(status, guardrailReason, scheduledFor, providerMessageId, Number(context.consent === 1), now, exactDuplicate.id);
    const reopened: StoredDispatch = { ...exactDuplicate, status, guardrailReason, scheduledFor, duplicate: false };
    if (input.entityType === "lease" && status !== "blocked") {
      db.prepare("UPDATE leases SET renewal_status = 'requested' WHERE id = ?").run(input.entityId);
    }
    appendDeliveryEvent(reopened.id, reopened.status, reopened.retryCount);
    writeAudit(input.userId, "message_guardrail_rechecked", input.entityType, input.entityId, {
      messageId: reopened.id,
      status,
      guardrail: guardrailReason ?? "passed",
      templateVersion: "v1",
      consentSnapshot: context.consent === 1 ? "granted" : "missing",
    });
    recordDispatchEvents(input, context, reopened);
    return reopened;
  }

  const id = randomUUID();
  const providerMessageId = status === "accepted" ? sandboxProviderId(id) : null;
  db.prepare(
    `INSERT INTO message_dispatches (
      id, user_id, entity_type, entity_id, channel, template_key, template_version,
      idempotency_key, status, guardrail_reason, scheduled_for, provider_message_id,
      consent_checked, retry_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, input.userId, input.entityType, input.entityId, "sandbox_alimtalk", input.templateKey,
    "v1", idempotencyKey, status, guardrailReason, scheduledFor, providerMessageId,
    Number(context.consent === 1), 0, now, now,
  );

  if (input.entityType === "lease" && status !== "blocked") {
    db.prepare("UPDATE leases SET renewal_status = 'requested' WHERE id = ?").run(input.entityId);
  }
  appendDeliveryEvent(id, status, 0);
  writeAudit(
    input.userId,
    input.entityType === "lease" ? "renewal_started" : "overdue_notice_requested",
    input.entityType,
    input.entityId,
    {
      status,
      guardrail: guardrailReason ?? "passed",
      templateVersion: "v1",
      consentSnapshot: context.consent === 1 ? "granted" : "missing",
      idempotencyScope: input.entityType === "charge" ? "lease-billing-period" : "lease-24-hours",
    },
  );
  const result: StoredDispatch = {
    id,
    entityType: input.entityType,
    entityId: input.entityId,
    templateKey: input.templateKey,
    status,
    guardrailReason,
    scheduledFor,
    duplicate: false,
    retryCount: 0,
  };
  recordDispatchEvents(input, context, result);
  return result;
}

export function retryTransactionalMessage(userId: string, messageId: string): MessageDispatchOperationResult {
  const db = getDatabase();
  const message = db.prepare(
    `SELECT id, entity_type AS entityType, entity_id AS entityId, template_key AS templateKey,
      status, guardrail_reason AS guardrailReason, scheduled_for AS scheduledFor,
      retry_count AS retryCount
     FROM message_dispatches WHERE id = ? AND user_id = ?`,
  ).get(messageId, userId) as StoredDispatch | undefined;
  if (!message) throw new MessageDispatchError("NOT_FOUND", "재시도할 메시지를 찾을 수 없습니다.");
  if (message.status !== "failed") throw new MessageDispatchError("RETRY_NOT_ALLOWED", "실패한 메시지만 다시 접수할 수 있습니다.");

  const input: DispatchInput = {
    userId,
    entityType: message.entityType,
    entityId: message.entityId,
    templateKey: message.templateKey as DispatchInput["templateKey"],
  };
  const context = dispatchContext(input);
  const decision = evaluateGuardrails({
    consent: context.consent === 1,
    recentDispatchCount: 0,
    now: new Date(),
    ...preferences(userId),
  });
  const status = decision.outcome === "allowed" ? "accepted" : decision.outcome;
  const guardrailReason = decision.outcome === "allowed" ? null : decision.reason;
  const scheduledFor = decision.outcome === "scheduled" ? decision.scheduledFor : null;
  const retryCount = message.retryCount + 1;
  const providerMessageId = status === "accepted" ? sandboxProviderId(message.id, retryCount) : null;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE message_dispatches SET status = ?, guardrail_reason = ?, scheduled_for = ?,
      provider_message_id = ?, consent_checked = ?, retry_count = ?, updated_at = ? WHERE id = ?`,
  ).run(status, guardrailReason, scheduledFor, providerMessageId, Number(context.consent === 1), retryCount, now, message.id);
  appendDeliveryEvent(message.id, status, retryCount);
  writeAudit(userId, "message_retry_requested", message.entityType, message.entityId, {
    messageId: message.id,
    retryCount,
    status,
    templateVersion: "v1",
    consentSnapshot: context.consent === 1 ? "granted" : "missing",
  });
  recordServerProductEvent("crm_message_retry_requested", userId, "/app/messages", {
    message_id: message.id,
    channel: "sandbox_alimtalk",
    outcome: status,
    retry_count: retryCount,
    template_version: "v1",
    consent_checked: context.consent === 1,
    quiet_hours_applied: status === "scheduled",
  });
  return { id: message.id, status, guardrailReason, scheduledFor, duplicate: false, retryCount };
}
