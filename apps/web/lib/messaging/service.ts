import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { MessageDispatchOperationResult } from "@jipjigi/domain";
import { recordServerProductEvent } from "@/lib/analytics/server";
import { getDatabase, type AppDatabase } from "@/lib/db/client";
import { writeAudit } from "@/lib/data/audit";
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
  constructor(public readonly code: "NOT_FOUND" | "RETRY_NOT_ALLOWED" | "TARGET_CHANGED", message: string) {
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

async function dispatchContext(db: AppDatabase, input: DispatchInput): Promise<DispatchContext> {
  const context = input.entityType === "charge"
    ? await db.prepare(
        `SELECT l.contact_consent AS consent, l.id AS leaseId, c.period AS billingPeriod
         FROM charges c JOIN leases l ON l.id = c.lease_id
         JOIN units u ON u.id = l.unit_id JOIN buildings b ON b.id = u.building_id
         WHERE c.id = ? AND b.owner_id = ? FOR UPDATE OF l`,
      ).get<DispatchContext>(input.entityId, input.userId)
    : await db.prepare(
        `SELECT l.contact_consent AS consent, l.id AS leaseId, NULL AS billingPeriod
         FROM leases l JOIN units u ON u.id = l.unit_id JOIN buildings b ON b.id = u.building_id
         WHERE l.id = ? AND b.owner_id = ? FOR UPDATE OF l`,
      ).get<DispatchContext>(input.entityId, input.userId);
  if (!context) throw new MessageDispatchError("NOT_FOUND", "메시지를 보낼 계약을 찾을 수 없습니다.");
  if (input.entityType === "charge") {
    const charge = await db.prepare("SELECT status FROM charges WHERE id = ? FOR UPDATE").get<{ status: string }>(input.entityId);
    if (charge?.status !== "overdue") throw new MessageDispatchError("TARGET_CHANGED", "납부 상태가 바뀌어 미납 안내를 접수하지 않았어요. 장부를 확인해 주세요.");
  }
  return context;
}

async function preferences(db: AppDatabase, userId: string) {
  const database = db;
  const value = await database
    .prepare(
      `SELECT quiet_hours_start AS quietHoursStart, quiet_hours_end AS quietHoursEnd
       FROM notification_preferences WHERE user_id = ?`,
    )
    .get<{ quietHoursStart: string; quietHoursEnd: string }>(userId);
  return value ?? { quietHoursStart: "21:00", quietHoursEnd: "08:00" };
}

async function appendDeliveryEvent(db: AppDatabase, dispatchId: string, status: StoredDispatch["status"], retryCount: number, providerOccurredAt: string | null = null) {
  const database = db;
  await database.prepare(
    `INSERT INTO message_delivery_events (
      id, dispatch_id, status, retry_count, provider_occurred_at, received_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), dispatchId, status, retryCount, providerOccurredAt, new Date().toISOString());
}

async function storedDispatchByIdempotencyKey(db: AppDatabase, userId: string, idempotencyKey: string) {
  const database = db;
  return database.prepare(
    `SELECT id, entity_type AS entityType, entity_id AS entityId, template_key AS templateKey,
      status, guardrail_reason AS guardrailReason, scheduled_for AS scheduledFor,
      retry_count AS retryCount
     FROM message_dispatches WHERE idempotency_key = ? AND user_id = ?`,
  ).get<StoredDispatch>(idempotencyKey, userId);
}

async function recentRenewalDispatch(db: AppDatabase, userId: string, leaseId: string) {
  const database = db;
  return database.prepare(
    `SELECT id, entity_type AS entityType, entity_id AS entityId, template_key AS templateKey,
      status, guardrail_reason AS guardrailReason, scheduled_for AS scheduledFor,
      retry_count AS retryCount
     FROM message_dispatches
     WHERE user_id = ? AND entity_type = 'lease' AND entity_id = ?
       AND status IN ('scheduled', 'accepted', 'delivered')
       AND created_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
     ORDER BY created_at DESC LIMIT 1`,
  ).get<StoredDispatch>(userId, leaseId);
}

async function recordDispatchEvents(db: AppDatabase, input: DispatchInput, context: DispatchContext, result: StoredDispatch) {
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
  await recordServerProductEvent("crm_message_requested", input.userId, "/app/messages", common, db);
  if (result.status === "blocked") {
    await recordServerProductEvent("crm_guardrail_blocked", input.userId, "/app/messages", {
      ...common,
      reason: result.guardrailReason ?? "unknown",
    }, db);
    return;
  }
  await recordServerProductEvent(
    input.entityType === "charge" ? "overdue_notice_requested" : "renewal_started",
    input.userId,
    input.entityType === "charge" ? "/app/ledger" : "/app/contracts",
    common, db);
}

export async function dispatchTransactionalMessage(input: DispatchInput, database?: AppDatabase): Promise<MessageDispatchOperationResult> {
  const db = database ?? await getDatabase();
  return db.transaction((transaction) => dispatchMessage(transaction, input));
}

async function dispatchMessage(db: AppDatabase, input: DispatchInput): Promise<MessageDispatchOperationResult> {
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const context = await dispatchContext(db, input);
  const idempotencyKey = logicalIdempotencyKey(input, context, nowDate);
  const exactDuplicate = await storedDispatchByIdempotencyKey(db, input.userId, idempotencyKey);
  if (exactDuplicate && exactDuplicate.status !== "blocked") return { ...exactDuplicate, duplicate: true };

  if (input.entityType === "lease") {
    const recent = await recentRenewalDispatch(db, input.userId, context.leaseId);
    if (recent && recent.id !== exactDuplicate?.id) return { ...recent, duplicate: true };
  }

  const recent = await db.prepare(
    `SELECT COUNT(*)::int AS count FROM message_dispatches
     WHERE user_id = ? AND entity_type = ? AND entity_id = ?
       AND status IN ('scheduled', 'accepted', 'delivered')
       AND created_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '7 days'`,
  ).get<{ count: number }>(input.userId, input.entityType, input.entityId);
  const notificationPreferences = await preferences(db, input.userId);
  const decision = evaluateGuardrails({
    consent: context.consent === 1,
    recentDispatchCount: recent?.count ?? 0,
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
    await db.prepare(
      `UPDATE message_dispatches SET status = ?, guardrail_reason = ?, scheduled_for = ?,
        provider_message_id = ?, consent_checked = ?, updated_at = ? WHERE id = ?`,
    ).run(status, guardrailReason, scheduledFor, providerMessageId, Number(context.consent === 1), now, exactDuplicate.id);
    const reopened: StoredDispatch = { ...exactDuplicate, status, guardrailReason, scheduledFor, duplicate: false };
    if (input.entityType === "lease" && status !== "blocked") {
      await db.prepare("UPDATE leases SET renewal_status = 'requested' WHERE id = ?").run(input.entityId);
    }
    await appendDeliveryEvent(db, reopened.id, reopened.status, reopened.retryCount);
    await writeAudit(input.userId, "message_guardrail_rechecked", input.entityType, input.entityId, {
      messageId: reopened.id,
      status,
      guardrail: guardrailReason ?? "passed",
      templateVersion: "v1",
      consentSnapshot: context.consent === 1 ? "granted" : "missing",
    }, db);
    await recordDispatchEvents(db, input, context, reopened);
    return reopened;
  }

  const id = randomUUID();
  const providerMessageId = status === "accepted" ? sandboxProviderId(id) : null;
  const inserted = await db.prepare(
    `INSERT INTO message_dispatches (
      id, user_id, entity_type, entity_id, channel, template_key, template_version,
      idempotency_key, status, guardrail_reason, scheduled_for, provider_message_id,
      consent_checked, retry_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (idempotency_key) DO NOTHING`,
  ).run(
    id, input.userId, input.entityType, input.entityId, "sandbox_alimtalk", input.templateKey,
    "v1", idempotencyKey, status, guardrailReason, scheduledFor, providerMessageId,
    Number(context.consent === 1), 0, now, now,
  );

  if (!inserted.changes) {
    const existing = await storedDispatchByIdempotencyKey(db, input.userId, idempotencyKey);
    if (!existing) throw new Error("MESSAGE_CONFLICT_NOT_FOUND");
    return { ...existing, duplicate: true };
  }

  if (input.entityType === "lease" && status !== "blocked") {
    await db.prepare("UPDATE leases SET renewal_status = 'requested' WHERE id = ?").run(input.entityId);
  }
  await appendDeliveryEvent(db, id, status, 0);
  await writeAudit(
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
    }, db);
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
  await recordDispatchEvents(db, input, context, result);
  return result;
}

export async function retryTransactionalMessage(userId: string, messageId: string, database?: AppDatabase): Promise<MessageDispatchOperationResult> {
  const db = database ?? await getDatabase();
  return db.transaction((transaction) => retryMessage(transaction, userId, messageId));
}

async function retryMessage(db: AppDatabase, userId: string, messageId: string): Promise<MessageDispatchOperationResult> {
  let message = await db.prepare(
    `SELECT id, entity_type AS entityType, entity_id AS entityId, template_key AS templateKey,
      status, guardrail_reason AS guardrailReason, scheduled_for AS scheduledFor,
      retry_count AS retryCount
     FROM message_dispatches WHERE id = ? AND user_id = ?`,
  ).get<StoredDispatch>(messageId, userId);
  if (!message) throw new MessageDispatchError("NOT_FOUND", "재시도할 메시지를 찾을 수 없습니다.");

  const input: DispatchInput = {
    userId,
    entityType: message.entityType,
    entityId: message.entityId,
    templateKey: message.templateKey as DispatchInput["templateKey"],
  };
  const context = await dispatchContext(db, input);
  message = await db.prepare(`SELECT id, entity_type AS entityType, entity_id AS entityId, template_key AS templateKey,
    status, guardrail_reason AS guardrailReason, scheduled_for AS scheduledFor, retry_count AS retryCount
    FROM message_dispatches WHERE id = ? AND user_id = ? FOR UPDATE`).get<StoredDispatch>(messageId, userId);
  if (!message) throw new MessageDispatchError("NOT_FOUND", "재시도할 메시지를 찾을 수 없습니다.");
  if (message.status !== "failed") {
    if (message.retryCount > 0) return { ...message, duplicate: true };
    throw new MessageDispatchError("RETRY_NOT_ALLOWED", "실패한 메시지만 다시 접수할 수 있습니다.");
  }
  const notificationPreferences = await preferences(db, userId);
  const recent = await db.prepare(`SELECT COUNT(*)::int AS count,
    COUNT(*) FILTER (WHERE created_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '24 hours')::int AS daily
    FROM message_dispatches WHERE user_id = ? AND entity_type = ? AND entity_id = ? AND id != ?
      AND status IN ('scheduled', 'accepted', 'delivered')
      AND created_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '7 days'`
  ).get<{ count: number; daily: number }>(userId, message.entityType, message.entityId, message.id);
  const decision = evaluateGuardrails({
    consent: context.consent === 1,
    recentDispatchCount: (recent?.daily ?? 0) > 0 ? 2 : recent?.count ?? 0,
    now: new Date(),
    ...notificationPreferences,
  });
  const status = decision.outcome === "allowed" ? "accepted" : decision.outcome;
  const guardrailReason = decision.outcome === "allowed" ? null : decision.reason;
  const scheduledFor = decision.outcome === "scheduled" ? decision.scheduledFor : null;
  const retryCount = message.retryCount + 1;
  const providerMessageId = status === "accepted" ? sandboxProviderId(message.id, retryCount) : null;
  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE message_dispatches SET status = ?, guardrail_reason = ?, scheduled_for = ?,
      provider_message_id = ?, consent_checked = ?, retry_count = ?, updated_at = ? WHERE id = ?`,
  ).run(status, guardrailReason, scheduledFor, providerMessageId, Number(context.consent === 1), retryCount, now, message.id);
  await appendDeliveryEvent(db, message.id, status, retryCount);
  await writeAudit(userId, "message_retry_requested", message.entityType, message.entityId, {
    messageId: message.id,
    retryCount,
    status,
    templateVersion: "v1",
    consentSnapshot: context.consent === 1 ? "granted" : "missing",
  }, db);
  await recordServerProductEvent("crm_message_retry_requested", userId, "/app/messages", {
    message_id: message.id,
    channel: "sandbox_alimtalk",
    outcome: status,
    retry_count: retryCount,
    template_version: "v1",
    consent_checked: context.consent === 1,
    quiet_hours_applied: status === "scheduled",
  }, db);
  return { id: message.id, status, guardrailReason, scheduledFor, duplicate: false, retryCount };
}
