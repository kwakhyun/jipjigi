import "server-only";
import { getDatabase } from "@/lib/db/client";
import type { DashboardSnapshot } from "@jipjigi/domain";

export async function listBuildings(userId: string) {
  const database = await getDatabase();
  return database
    .prepare(
      `SELECT b.id, b.name, b.address, b.total_units AS totalUnits,
        SUM(CASE WHEN u.status = 'occupied' THEN 1 ELSE 0 END)::int AS occupiedUnits
       FROM buildings b
       LEFT JOIN units u ON u.building_id = b.id
       WHERE b.owner_id = ?
       GROUP BY b.id
       ORDER BY CASE WHEN b.id = 'building-seongsu' THEN 0 ELSE 1 END, b.created_at ASC`,
    )
    .all<{
    id: string;
    name: string;
    address: string;
    totalUnits: number;
    occupiedUnits: number;
  }>(userId);
}

/** All metrics, representative cards and counts share one PostgreSQL statement snapshot. */
export async function getDashboardSnapshot(userId: string, buildingId?: string): Promise<DashboardSnapshot> {
  const db = await getDatabase();
  const result = await db.prepare(`
    WITH building AS (
      SELECT id, name, address, total_units FROM buildings
      WHERE owner_id = ? AND (?::text IS NULL OR id = ?)
      ORDER BY CASE WHEN id = 'building-seongsu' THEN 0 ELSE 1 END, created_at, id LIMIT 1
    ), scoped_units AS (
      SELECT u.* FROM units u JOIN building b ON b.id = u.building_id
    ), scoped_leases AS (
      SELECT l.*, u.name AS unitName FROM leases l JOIN scoped_units u ON u.id = l.unit_id
    ), scoped_charges AS (
      SELECT c.*, l.unit_id, l.unitName, l.tenant_name FROM charges c JOIN scoped_leases l ON l.id = c.lease_id
    ), preferences AS (
      SELECT COALESCE(p.rent_reminder, 1) AS rent,
        COALESCE(p.renewal_reminder, 1) AS renewal, COALESCE(p.maintenance_updates, 1) AS maintenance
      FROM (SELECT 1) singleton LEFT JOIN notification_preferences p ON p.user_id = ?
    ), renewals AS (
      SELECT l.id AS leaseId, l.unit_id AS unitId, l.unitName,
        l.tenant_name AS tenantName, l.end_date,
        (l.end_date::date - (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date)::int AS daysLeft,
        l.deposit_amount AS currentDeposit, l.monthly_rent AS currentRent,
        CAST(ROUND(l.monthly_rent * 1.04 / 10000) * 10000 AS INTEGER) AS suggestedRent,
        l.renewal_status AS status
      FROM scoped_leases l, preferences p
      WHERE p.renewal = 1 AND l.status = 'active' AND l.renewal_status IN ('attention', 'requested')
        AND l.end_date::date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date + 60
    ), overdue AS (
      SELECT c.id AS chargeId, c.unit_id AS unitId, c.unitName, c.tenant_name AS tenantName,
        c.amount, c.due_date,
        ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - c.due_date::date)::int AS daysOverdue,
        COALESCE((SELECT md.status FROM message_dispatches md WHERE md.entity_type = 'charge' AND md.entity_id = c.id ORDER BY md.created_at DESC LIMIT 1), 'not_sent') AS noticeStatus
      FROM scoped_charges c, preferences p WHERE p.rent = 1 AND c.status = 'overdue'
    ), repairs AS (
      SELECT m.id AS requestId, m.unit_id AS unitId, u.name AS unitName, m.title, m.status,
        m.requested_at AS requestedAt, m.priority
      FROM maintenance_requests m JOIN scoped_units u ON u.id = m.unit_id WHERE m.status != 'completed'
    ), visible_repairs AS (
      SELECT r.* FROM repairs r, preferences p WHERE p.maintenance = 1
    ), issues AS (
      SELECT "unitId" FROM renewals UNION ALL SELECT "unitId" FROM overdue UNION ALL SELECT "unitId" FROM visible_repairs
    ), money AS (
      SELECT COALESCE(SUM(amount), 0) AS expected,
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS collected
      FROM scoped_charges WHERE period = (SELECT MAX(period) FROM scoped_charges)
    ), activity AS (
      SELECT id, action, occurred_at AS occurredAt FROM audit_logs
      WHERE user_id = ? ORDER BY occurred_at DESC LIMIT 6
    )
    SELECT json_build_object(
      'generatedAt', to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'hasMutedBriefings', p.rent = 0 OR p.renewal = 0 OR p.maintenance = 0,
      'building', json_build_object('id', b.id, 'name', b.name, 'address', b.address, 'totalUnits', b.total_units,
        'occupiedUnits', (SELECT COUNT(*) FROM scoped_units WHERE status = 'occupied')),
      'metrics', json_build_object('billingPeriod', (SELECT MAX(period) FROM scoped_charges),
        'collectionRate', CASE WHEN money.expected = 0 THEN 0 ELSE ROUND(money.collected * 100.0 / money.expected, 1) END,
        'collectedAmount', money.collected, 'expectedAmount', money.expected,
        'occupiedRate', CASE WHEN b.total_units = 0 THEN 0 ELSE ROUND((SELECT COUNT(*) FROM scoped_units WHERE status = 'occupied') * 100.0 / b.total_units, 1) END,
        'openMaintenance', (SELECT COUNT(*) FROM repairs)),
      'attention', json_build_object('renewal', (SELECT COUNT(*) FROM renewals), 'overdue', (SELECT COUNT(*) FROM overdue),
        'maintenance', (SELECT COUNT(*) FROM visible_repairs), 'total', (SELECT COUNT(*) FROM issues),
        'affectedUnits', (SELECT COUNT(DISTINCT "unitId") FROM issues)),
      'briefing', json_build_object(
        'renewal', (SELECT row_to_json(r) FROM (SELECT * FROM renewals ORDER BY end_date, "leaseId" LIMIT 1) r),
        'overdue', (SELECT row_to_json(r) FROM (SELECT * FROM overdue ORDER BY due_date, "chargeId" LIMIT 1) r),
        'maintenance', (SELECT row_to_json(r) FROM (SELECT * FROM visible_repairs ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, "requestedAt", "requestId" LIMIT 1) r)),
      'recentActivities', COALESCE((SELECT json_agg(activity) FROM activity), '[]'::json)
    ) AS snapshot FROM building b CROSS JOIN preferences p CROSS JOIN money
  `).get<{ snapshot: Omit<DashboardSnapshot, "recentActivities"> & { recentActivities: Array<{ id: string; action: string; occurredAt: string }> } }>(userId, buildingId ?? null, buildingId ?? null, userId, userId);
  if (!result) throw new Error("BUILDING_NOT_FOUND");
  const activityMap: Record<string, { label: string; detail: string; tone: "positive" | "neutral" | "warning" }> = {
    rent_collected: { label: "월세 입금 확인", detail: "납부 상태가 자동으로 반영됐어요", tone: "positive" },
    maintenance_received: { label: "수리 요청 접수", detail: "접수된 수리 요청을 확인해 주세요", tone: "neutral" },
    lease_risk_detected: { label: "계약 만료 임박", detail: "만료가 가까운 계약을 확인해 주세요", tone: "warning" },
    payment_marked: { label: "입금 직접 확인", detail: "장부 상태를 납부 완료로 변경했어요", tone: "positive" },
    overdue_notice_requested: { label: "미납 안내 접수", detail: "발송 제한을 확인하고 접수했어요", tone: "neutral" },
    renewal_started: { label: "갱신 안내 접수", detail: "갱신 의사 확인 요청을 접수했어요", tone: "neutral" },
    maintenance_updated: { label: "수리 상태 변경", detail: "처리 상태를 변경했어요", tone: "positive" },
    notification_preferences_updated: { label: "알림 설정 변경", detail: "홈 표시 항목과 메시지 발송 기준을 저장했어요", tone: "neutral" },
  };

  return { ...result.snapshot, recentActivities: result.snapshot.recentActivities.map((row) => ({
    id: row.id, occurredAt: row.occurredAt,
    ...(activityMap[row.action] ?? { label: "운영 정보 변경", detail: "변경 사항을 저장했어요", tone: "neutral" as const }),
  })) };
}
