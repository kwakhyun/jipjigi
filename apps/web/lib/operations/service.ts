import "server-only";

import type { Operation, OperationResult } from "@jipjigi/domain";
import { recordServerProductEvent } from "@/lib/analytics/server";
import { getDatabase } from "@/lib/db/client";
import { writeAudit } from "@/lib/data/repository";
import { dispatchTransactionalMessage, MessageDispatchError, retryTransactionalMessage } from "@/lib/messaging/service";

export class OperationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

async function markPayment(userId: string, chargeId: string) {
  const db = await getDatabase();
  const charge = await db
    .prepare(
      `SELECT c.id, c.status FROM charges c
       JOIN leases l ON l.id = c.lease_id JOIN units u ON u.id = l.unit_id
       JOIN buildings b ON b.id = u.building_id
       WHERE c.id = ? AND b.owner_id = ?`,
    )
    .get<{ id: string; status: string }>(chargeId, userId);
  if (!charge) throw new OperationError("NOT_FOUND", "임대료 청구 내역을 찾을 수 없습니다.", 404);
  if (charge.status === "paid") return { status: "paid" as const, unchanged: true };

  await db.prepare("UPDATE charges SET status = 'paid', paid_at = ? WHERE id = ?").run(new Date().toISOString(), chargeId);
  await writeAudit(userId, "payment_marked", "charge", chargeId);
  await recordServerProductEvent("payment_marked", userId, "/app/ledger", { charge_id: chargeId, outcome: "paid" });
  return { status: "paid" as const, unchanged: false };
}

async function updateMaintenance(
  userId: string,
  requestId: string,
  status: "received" | "scheduled" | "completed",
  scheduledAt?: string,
) {
  const db = await getDatabase();
  const request = await db
    .prepare(
      `SELECT m.id, m.status FROM maintenance_requests m
       JOIN units u ON u.id = m.unit_id JOIN buildings b ON b.id = u.building_id
       WHERE m.id = ? AND b.owner_id = ?`,
    )
    .get<{ id: string; status: "received" | "scheduled" | "completed" }>(requestId, userId);
  if (!request) throw new OperationError("NOT_FOUND", "수리 요청을 찾을 수 없습니다.", 404);
  const order = { received: 0, scheduled: 1, completed: 2 } as const;
  if (order[status] < order[request.status]) {
    throw new OperationError("INVALID_TRANSITION", "완료된 수리 요청은 이전 상태로 되돌릴 수 없습니다.");
  }
  if (status === request.status) return { status, unchanged: true };
  const now = new Date().toISOString();
  if (status === "scheduled") {
    if (!scheduledAt) throw new OperationError("SCHEDULE_REQUIRED", "방문 날짜와 시간을 선택해 주세요.");
    if (Date.parse(scheduledAt) <= Date.now()) {
      throw new OperationError("SCHEDULE_IN_PAST", "현재보다 이후의 방문 시간을 선택해 주세요.");
    }
  }
  await db.prepare(
    `UPDATE maintenance_requests SET status = ?, updated_at = ?,
      scheduled_at = CASE WHEN ? = 'scheduled' THEN ? ELSE scheduled_at END,
      completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END
     WHERE id = ?`,
  ).run(status, now, status, scheduledAt ?? null, status, now, requestId);
  await writeAudit(userId, "maintenance_updated", "maintenance", requestId, {
    status,
    ...(scheduledAt ? { scheduledAt } : {}),
  });
  await recordServerProductEvent("maintenance_updated", userId, "/app/maintenance", { request_id: requestId, outcome: status });
  return { status, unchanged: false };
}

export async function runOperation(userId: string, operation: Operation): Promise<OperationResult> {
  try {
    switch (operation.type) {
      case "mark_payment":
        return await markPayment(userId, operation.chargeId);
      case "send_overdue_notice":
        return await dispatchTransactionalMessage({
          userId,
          entityType: "charge",
          entityId: operation.chargeId,
          templateKey: "overdue_notice_v1",
        });
      case "start_renewal":
        return await dispatchTransactionalMessage({
          userId,
          entityType: "lease",
          entityId: operation.leaseId,
          templateKey: "renewal_check_v1",
        });
      case "retry_message":
        return await retryTransactionalMessage(userId, operation.messageId);
      case "update_maintenance":
        return await updateMaintenance(userId, operation.requestId, operation.status, operation.scheduledAt);
    }
  } catch (error) {
    if (error instanceof MessageDispatchError) throw new OperationError(error.code, error.message, error.code === "NOT_FOUND" ? 404 : 409);
    throw error;
  }
}
