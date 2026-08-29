import "server-only";

import type { Operation, OperationResult } from "@rentflow/domain";
import { getDatabase } from "@/lib/db/client";
import { writeAudit } from "@/lib/data/repository";
import { dispatchTransactionalMessage } from "@/lib/messaging/service";

export class OperationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

function markPayment(userId: string, chargeId: string) {
  const db = getDatabase();
  const charge = db
    .prepare(
      `SELECT c.id, c.status FROM charges c
       JOIN leases l ON l.id = c.lease_id JOIN units u ON u.id = l.unit_id
       JOIN buildings b ON b.id = u.building_id
       WHERE c.id = ? AND b.owner_id = ?`,
    )
    .get(chargeId, userId) as { id: string; status: string } | undefined;
  if (!charge) throw new OperationError("NOT_FOUND", "임대료 청구 내역을 찾을 수 없습니다.", 404);
  if (charge.status === "paid") return { status: "paid" as const, unchanged: true };

  db.prepare("UPDATE charges SET status = 'paid', paid_at = ? WHERE id = ?").run(new Date().toISOString(), chargeId);
  writeAudit(userId, "payment_marked", "charge", chargeId);
  return { status: "paid" as const, unchanged: false };
}

function updateMaintenance(
  userId: string,
  requestId: string,
  status: "received" | "scheduled" | "completed",
  scheduledAt?: string,
) {
  const db = getDatabase();
  const request = db
    .prepare(
      `SELECT m.id, m.status FROM maintenance_requests m
       JOIN units u ON u.id = m.unit_id JOIN buildings b ON b.id = u.building_id
       WHERE m.id = ? AND b.owner_id = ?`,
    )
    .get(requestId, userId) as { id: string; status: "received" | "scheduled" | "completed" } | undefined;
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
  db.prepare(
    `UPDATE maintenance_requests SET status = ?, updated_at = ?,
      scheduled_at = CASE WHEN ? = 'scheduled' THEN ? ELSE scheduled_at END,
      completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END
     WHERE id = ?`,
  ).run(status, now, status, scheduledAt ?? null, status, now, requestId);
  writeAudit(userId, "maintenance_updated", "maintenance", requestId, {
    status,
    ...(scheduledAt ? { scheduledAt } : {}),
  });
  return { status, unchanged: false };
}

export function runOperation(userId: string, operation: Operation): OperationResult {
  switch (operation.type) {
    case "mark_payment":
      return markPayment(userId, operation.chargeId);
    case "send_overdue_notice":
      return dispatchTransactionalMessage({
        userId,
        entityType: "charge",
        entityId: operation.chargeId,
        templateKey: "overdue_notice_v1",
        idempotencyKey: operation.idempotencyKey,
      });
    case "start_renewal":
      return dispatchTransactionalMessage({
        userId,
        entityType: "lease",
        entityId: operation.leaseId,
        templateKey: "renewal_check_v1",
        idempotencyKey: operation.idempotencyKey,
      });
    case "update_maintenance":
      return updateMaintenance(userId, operation.requestId, operation.status, operation.scheduledAt);
  }
}
