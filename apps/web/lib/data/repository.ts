import "server-only";

import { randomUUID } from "node:crypto";
import type { DashboardSnapshot, NotificationPreferences } from "@jipjigi/domain";
import { assignVariant, briefingPriorityExperiment, type BriefingVariant } from "@jipjigi/experiments";
import { recordServerProductEvent } from "@/lib/analytics/server";
import { getDatabase } from "@/lib/db/client";
import { CORE_WEB_VITAL_TARGETS, type CoreWebVitalName } from "@/lib/performance/schema";

export type LedgerRow = {
  id: string;
  period: string;
  dueDate: string;
  amount: number;
  status: "paid" | "overdue" | "upcoming";
  paidAt: string | null;
  unitName: string;
  tenantName: string;
  buildingName: string;
};

export type ContractRow = {
  id: string;
  unitName: string;
  tenantName: string;
  tenantPhoneMasked: string;
  startDate: string;
  endDate: string;
  depositAmount: number;
  monthlyRent: number;
  renewalStatus: "none" | "attention" | "requested" | "agreed" | "ended";
  buildingName: string;
  timeline: ContractTimelineEvent[];
};

export type ContractTimelineEvent = {
  id: string;
  kind: "message" | "response";
  status: "scheduled" | "accepted" | "delivered" | "blocked" | "failed" | "agreed" | "declined";
  occurredAt: string;
  retryCount: number;
};

export type MaintenanceRow = {
  id: string;
  unitName: string;
  buildingName: string;
  title: string;
  description: string;
  priority: "low" | "normal" | "urgent";
  status: "received" | "scheduled" | "completed";
  requestedAt: string;
  scheduledAt: string | null;
  completedAt: string | null;
};

export type MessageRow = {
  id: string;
  entityType: string;
  entityId: string;
  channel: string;
  templateKey: string;
  status: "scheduled" | "accepted" | "delivered" | "blocked" | "failed";
  guardrailReason: string | null;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  retryCount: number;
};

export function getUserByEmail(email: string) {
  return getDatabase()
    .prepare("SELECT id, email, name, password_hash AS passwordHash, role FROM users WHERE lower(email) = lower(?)")
    .get(email) as
    | { id: string; email: string; name: string; passwordHash: string; role: "owner" | "operator" }
    | undefined;
}

export function listBuildings(userId: string) {
  return getDatabase()
    .prepare(
      `SELECT b.id, b.name, b.address, b.total_units AS totalUnits,
        SUM(CASE WHEN u.status = 'occupied' THEN 1 ELSE 0 END) AS occupiedUnits
       FROM buildings b
       LEFT JOIN units u ON u.building_id = b.id
       WHERE b.owner_id = ?
       GROUP BY b.id
       ORDER BY CASE WHEN b.id = 'building-seongsu' THEN 0 ELSE 1 END, b.created_at ASC`,
    )
    .all(userId) as Array<{
    id: string;
    name: string;
    address: string;
    totalUnits: number;
    occupiedUnits: number;
  }>;
}

function ownedBuilding(userId: string, buildingId?: string) {
  const db = getDatabase();
  const requested = buildingId
    ? db
        .prepare("SELECT id, name, address, total_units AS totalUnits FROM buildings WHERE id = ? AND owner_id = ?")
        .get(buildingId, userId)
    : db
        .prepare("SELECT id, name, address, total_units AS totalUnits FROM buildings WHERE owner_id = ? ORDER BY CASE WHEN id = 'building-seongsu' THEN 0 ELSE 1 END, created_at LIMIT 1")
        .get(userId);
  if (!requested) throw new Error("BUILDING_NOT_FOUND");
  return requested as { id: string; name: string; address: string; totalUnits: number };
}

export function getDashboardSnapshot(userId: string, buildingId?: string): DashboardSnapshot {
  const db = getDatabase();
  const building = ownedBuilding(userId, buildingId);
  const occupancy = db
    .prepare(
      `SELECT SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) AS occupiedUnits
       FROM units WHERE building_id = ?`,
    )
    .get(building.id) as { occupiedUnits: number | null };
  const latestPeriod = db
    .prepare(
      `SELECT MAX(c.period) AS period FROM charges c
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       WHERE u.building_id = ?`,
    )
    .get(building.id) as { period: string | null };
  const money = db
    .prepare(
      `SELECT COALESCE(SUM(c.amount), 0) AS expectedAmount,
        COALESCE(SUM(CASE WHEN c.status = 'paid' THEN c.amount ELSE 0 END), 0) AS collectedAmount
       FROM charges c
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       WHERE u.building_id = ? AND c.period = ?`,
    )
    .get(building.id, latestPeriod.period ?? "") as { expectedAmount: number; collectedAmount: number };
  const openMaintenance = db
    .prepare(
      `SELECT COUNT(*) AS count FROM maintenance_requests m
       JOIN units u ON u.id = m.unit_id
       WHERE u.building_id = ? AND m.status != 'completed'`,
    )
    .get(building.id) as { count: number };

  const renewal = db
    .prepare(
      `SELECT l.id AS leaseId, u.name AS unitName, l.tenant_name AS tenantName,
        CAST(julianday(l.end_date) - julianday(date('now', '+9 hours')) AS INTEGER) AS daysLeft,
        l.deposit_amount AS currentDeposit, l.monthly_rent AS currentRent,
        CAST(ROUND(l.monthly_rent * 1.04 / 10000) * 10000 AS INTEGER) AS suggestedRent,
        l.renewal_status AS status
       FROM leases l JOIN units u ON u.id = l.unit_id
       WHERE u.building_id = ? AND l.status = 'active' AND l.renewal_status IN ('attention', 'requested')
       ORDER BY l.end_date ASC LIMIT 1`,
    )
    .get(building.id) as DashboardSnapshot["briefing"]["renewal"];

  const overdue = db
    .prepare(
      `SELECT c.id AS chargeId, u.name AS unitName, l.tenant_name AS tenantName,
        c.amount,
        CAST(julianday(date('now', '+9 hours')) - julianday(c.due_date) AS INTEGER) AS daysOverdue,
        COALESCE((SELECT md.status FROM message_dispatches md
          WHERE md.entity_type = 'charge' AND md.entity_id = c.id
          ORDER BY md.created_at DESC LIMIT 1), 'not_sent') AS noticeStatus
       FROM charges c
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       WHERE u.building_id = ? AND c.status = 'overdue'
       ORDER BY c.due_date ASC LIMIT 1`,
    )
    .get(building.id) as DashboardSnapshot["briefing"]["overdue"];

  const maintenance = db
    .prepare(
      `SELECT m.id AS requestId, u.name AS unitName, m.title, m.status,
        m.requested_at AS requestedAt
       FROM maintenance_requests m JOIN units u ON u.id = m.unit_id
       WHERE u.building_id = ? AND m.status != 'completed'
       ORDER BY CASE m.priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
         m.requested_at ASC LIMIT 1`,
    )
    .get(building.id) as DashboardSnapshot["briefing"]["maintenance"];

  const activityRows = db
    .prepare(
      `SELECT id, action, entity_type AS entityType, entity_id AS entityId, occurred_at AS occurredAt
       FROM audit_logs WHERE user_id = ? ORDER BY occurred_at DESC LIMIT 6`,
    )
    .all(userId) as Array<{ id: string; action: string; entityType: string; entityId: string; occurredAt: string }>;
  const activityMap: Record<string, { label: string; detail: string; tone: "positive" | "neutral" | "warning" }> = {
    rent_collected: { label: "월세 입금 확인", detail: "납부 상태가 자동으로 반영됐어요", tone: "positive" },
    maintenance_received: { label: "수리 요청 접수", detail: "302호 요청 내용을 확인해 주세요", tone: "neutral" },
    lease_risk_detected: { label: "계약 만료 임박", detail: "501호 계약 갱신 여부를 확인해 주세요", tone: "warning" },
    payment_marked: { label: "입금 직접 확인", detail: "장부 상태를 납부 완료로 변경했어요", tone: "positive" },
    overdue_notice_sent: { label: "미납 안내 접수", detail: "발송 제한을 확인하고 접수했어요", tone: "neutral" },
    renewal_started: { label: "갱신 협의 시작", detail: "임차인에게 확인 요청을 보냈어요", tone: "neutral" },
    maintenance_updated: { label: "수리 상태 변경", detail: "처리 상태를 변경했어요", tone: "positive" },
  };

  const occupiedUnits = occupancy.occupiedUnits ?? 0;
  return {
    generatedAt: new Date().toISOString(),
    building: { ...building, occupiedUnits },
    metrics: {
      collectionRate: money.expectedAmount === 0 ? 0 : Math.round((money.collectedAmount / money.expectedAmount) * 1000) / 10,
      collectedAmount: money.collectedAmount,
      expectedAmount: money.expectedAmount,
      occupiedRate: Math.round((occupiedUnits / building.totalUnits) * 1000) / 10,
      openMaintenance: openMaintenance.count,
    },
    briefing: { renewal: renewal ?? null, overdue: overdue ?? null, maintenance: maintenance ?? null },
    recentActivities: activityRows.map((row) => ({
      id: row.id,
      ...(activityMap[row.action] ?? { label: row.action, detail: `${row.entityType} 정보가 변경됐어요`, tone: "neutral" as const }),
      occurredAt: row.occurredAt,
    })),
  };
}

export function listLedger(userId: string) {
  return getDatabase()
    .prepare(
      `SELECT c.id, c.period, c.due_date AS dueDate, c.amount, c.status, c.paid_at AS paidAt,
        u.name AS unitName, l.tenant_name AS tenantName, b.name AS buildingName
       FROM charges c
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       JOIN buildings b ON b.id = u.building_id
       WHERE b.owner_id = ? ORDER BY c.due_date DESC, b.name, u.name`,
    )
    .all(userId) as LedgerRow[];
}

export function listContracts(userId: string) {
  const db = getDatabase();
  const contracts = db
    .prepare(
      `SELECT l.id, u.name AS unitName, l.tenant_name AS tenantName,
        l.tenant_phone_masked AS tenantPhoneMasked, l.start_date AS startDate,
        l.end_date AS endDate, l.deposit_amount AS depositAmount, l.monthly_rent AS monthlyRent,
        l.renewal_status AS renewalStatus, b.name AS buildingName
       FROM leases l
       JOIN units u ON u.id = l.unit_id
       JOIN buildings b ON b.id = u.building_id
       WHERE b.owner_id = ? AND l.status = 'active'
       ORDER BY CASE l.renewal_status WHEN 'attention' THEN 0 WHEN 'requested' THEN 1 ELSE 2 END, l.end_date`,
    )
    .all(userId) as Array<Omit<ContractRow, "timeline">>;
  const timeline = db.prepare(
    `SELECT md.entity_id AS leaseId, mde.id, 'message' AS kind, mde.status,
      COALESCE(mde.provider_occurred_at, mde.received_at) AS occurredAt,
      mde.retry_count AS retryCount
     FROM message_delivery_events mde
     JOIN message_dispatches md ON md.id = mde.dispatch_id
     JOIN leases l ON l.id = md.entity_id
     JOIN units u ON u.id = l.unit_id JOIN buildings b ON b.id = u.building_id
     WHERE md.entity_type = 'lease' AND b.owner_id = ?
     UNION ALL
     SELECT r.lease_id AS leaseId, r.id, 'response' AS kind, r.response AS status,
      r.provider_occurred_at AS occurredAt, 0 AS retryCount
     FROM renewal_response_events r
     JOIN leases l ON l.id = r.lease_id
     JOIN units u ON u.id = l.unit_id JOIN buildings b ON b.id = u.building_id
     WHERE b.owner_id = ?
     ORDER BY occurredAt DESC`,
  ).all(userId, userId) as Array<ContractTimelineEvent & { leaseId: string }>;
  return contracts.map((contract) => ({
    ...contract,
    timeline: timeline.filter((event) => event.leaseId === contract.id).slice(0, 8).map(({ leaseId: _leaseId, ...event }) => event),
  }));
}

export function listMaintenance(userId: string) {
  return getDatabase()
    .prepare(
      `SELECT m.id, u.name AS unitName, b.name AS buildingName, m.title, m.description,
        m.priority, m.status, m.requested_at AS requestedAt,
        m.scheduled_at AS scheduledAt, m.completed_at AS completedAt
       FROM maintenance_requests m
       JOIN units u ON u.id = m.unit_id
       JOIN buildings b ON b.id = u.building_id
       WHERE b.owner_id = ?
       ORDER BY CASE m.status WHEN 'received' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, m.requested_at DESC`,
    )
    .all(userId) as MaintenanceRow[];
}

export function listMessages(userId: string) {
  return getDatabase()
    .prepare(
      `SELECT id, entity_type AS entityType, entity_id AS entityId, channel,
        template_key AS templateKey, status, guardrail_reason AS guardrailReason,
        scheduled_for AS scheduledFor, created_at AS createdAt, updated_at AS updatedAt,
        delivered_at AS deliveredAt, retry_count AS retryCount
       FROM message_dispatches WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .all(userId) as MessageRow[];
}

export function getPreferences(userId: string) {
  return getDatabase()
    .prepare(
      `SELECT rent_reminder AS rentReminder, renewal_reminder AS renewalReminder,
        maintenance_updates AS maintenanceUpdates, marketing,
        quiet_hours_start AS quietHoursStart, quiet_hours_end AS quietHoursEnd
       FROM notification_preferences WHERE user_id = ?`,
    )
    .get(userId) as {
    rentReminder: 0 | 1;
    renewalReminder: 0 | 1;
    maintenanceUpdates: 0 | 1;
    marketing: 0 | 1;
    quietHoursStart: string;
    quietHoursEnd: string;
  };
}

export function updatePreferences(userId: string, value: NotificationPreferences) {
  getDatabase()
    .prepare(
      `UPDATE notification_preferences SET rent_reminder = ?, renewal_reminder = ?,
        maintenance_updates = ?, marketing = ?, quiet_hours_start = ?, quiet_hours_end = ?, updated_at = ?
       WHERE user_id = ?`,
    )
    .run(
      Number(value.rentReminder),
      Number(value.renewalReminder),
      Number(value.maintenanceUpdates),
      Number(value.marketing),
      value.quietHoursStart,
      value.quietHoursEnd,
      new Date().toISOString(),
      userId,
    );
  writeAudit(userId, "notification_preferences_updated", "notification_preferences", userId, {
    rentReminder: value.rentReminder,
    renewalReminder: value.renewalReminder,
    maintenanceUpdates: value.maintenanceUpdates,
    marketing: value.marketing,
  });
  recordServerProductEvent("notification_preferences_updated", userId, "/app/settings", {
    outcome: "saved",
    source: "settings",
  });
  return value;
}

export function getOrCreateExperimentAssignment(userId: string): BriefingVariant {
  const db = getDatabase();
  const existing = db
    .prepare("SELECT variant FROM experiment_assignments WHERE user_id = ? AND experiment_key = ?")
    .get(userId, briefingPriorityExperiment.key) as { variant: BriefingVariant } | undefined;
  if (existing) return existing.variant;
  const variant = assignVariant(briefingPriorityExperiment, userId);
  db.prepare(
    `INSERT INTO experiment_assignments (id, user_id, experiment_key, variant, assigned_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(randomUUID(), userId, briefingPriorityExperiment.key, variant, new Date().toISOString());
  return variant;
}

export function getGrowthOverview() {
  const db = getDatabase();
  const eventCounts = db
    .prepare(
      `SELECT name, COUNT(*) AS count FROM product_events
       WHERE user_id IS NOT NULL AND occurred_at >= datetime('now', '-7 days')
       GROUP BY name ORDER BY count DESC`,
    )
    .all() as Array<{ name: string; count: number }>;
  const recentEvents = db
    .prepare(
      `SELECT id, name, path, properties_json AS propertiesJson,
        release_version AS releaseVersion, experiment_key AS experimentKey,
        variant, user_segment AS userSegment, occurred_at AS occurredAt
       FROM product_events
       WHERE user_id IS NOT NULL AND occurred_at >= datetime('now', '-7 days')
       ORDER BY occurred_at DESC LIMIT 20`,
    )
    .all() as Array<{
      id: string;
      name: string;
      path: string;
      propertiesJson: string;
      releaseVersion: string;
      experimentKey: string | null;
      variant: string | null;
      userSegment: string;
      occurredAt: string;
    }>;
  const messageStats = db
    .prepare(
      `SELECT status, COUNT(*) AS count FROM message_dispatches
       WHERE created_at >= datetime('now', '-7 days') GROUP BY status`,
    )
    .all() as Array<{ status: string; count: number }>;
  const assignmentCounts = db
    .prepare(
      `SELECT variant, COUNT(*) AS count FROM experiment_assignments
       WHERE experiment_key = ? GROUP BY variant`,
    )
    .all(briefingPriorityExperiment.key) as Array<{ variant: BriefingVariant; count: number }>;
  const experimentResults = db.prepare(
    `WITH exposures AS (
       SELECT user_id, variant, MIN(occurred_at) AS exposedAt
       FROM product_events
       WHERE experiment_key = ? AND name = 'experiment_exposed'
         AND occurred_at >= datetime('now', '-7 days')
         AND variant IN ('risk-first', 'agenda-first')
       GROUP BY user_id, variant
     ), converted AS (
       SELECT DISTINCT e.user_id, e.variant
       FROM exposures e JOIN product_events action ON action.user_id = e.user_id
       WHERE action.name IN ('renewal_started', 'overdue_notice_requested', 'payment_marked', 'maintenance_updated')
         AND julianday(action.occurred_at) BETWEEN julianday(e.exposedAt) AND julianday(e.exposedAt, '+24 hours')
     )
     SELECT e.variant, COUNT(*) AS exposedUsers, COUNT(c.user_id) AS actionUsers
     FROM exposures e LEFT JOIN converted c ON c.user_id = e.user_id AND c.variant = e.variant
     GROUP BY e.variant ORDER BY e.variant`,
  ).all(briefingPriorityExperiment.key) as Array<{ variant: BriefingVariant; exposedUsers: number; actionUsers: number }>;
  const deliveredRecipients = db.prepare(
    `SELECT COUNT(DISTINCT CASE WHEN md.entity_type = 'lease' THEN md.entity_id ELSE c.lease_id END) AS count
     FROM message_dispatches md LEFT JOIN charges c ON md.entity_type = 'charge' AND c.id = md.entity_id
     WHERE md.status = 'delivered' AND md.delivered_at >= datetime('now', '-7 days')`,
  ).get() as { count: number };
  const optOuts = db.prepare(
    `SELECT COUNT(DISTINCT o.lease_id) AS count
     FROM crm_opt_outs o
     WHERE o.occurred_at >= datetime('now', '-7 days')
       AND EXISTS (
         SELECT 1 FROM message_dispatches md
         LEFT JOIN charges c ON md.entity_type = 'charge' AND c.id = md.entity_id
         WHERE md.status = 'delivered' AND md.delivered_at >= datetime('now', '-7 days')
           AND (CASE WHEN md.entity_type = 'lease' THEN md.entity_id ELSE c.lease_id END) = o.lease_id
       )`,
  ).get() as { count: number };
  const acceptedAttempts = messageStats
    .filter((item) => ["accepted", "delivered", "failed"].includes(item.status))
    .reduce((sum, item) => sum + item.count, 0);
  const deliveredMessages = messageStats.find((item) => item.status === "delivered")?.count ?? 0;
  const blockedMessages = messageStats.find((item) => item.status === "blocked")?.count ?? 0;
  const totalRequests = messageStats.reduce((sum, item) => sum + item.count, 0);
  const crmGuardrails = {
    deliveryRate: acceptedAttempts ? Math.round((deliveredMessages / acceptedAttempts) * 1000) / 10 : null,
    optOutRate: deliveredRecipients.count ? Math.round((optOuts.count / deliveredRecipients.count) * 1000) / 10 : null,
    blockedRate: totalRequests ? Math.round((blockedMessages / totalRequests) * 1000) / 10 : null,
    deliveredRecipients: deliveredRecipients.count,
    optOuts: optOuts.count,
  };
  return { assignmentCounts, experimentResults, eventCounts, recentEvents, messageStats, crmGuardrails };
}

export function getWebVitalsOverview() {
  const rows = getDatabase()
    .prepare(
      `SELECT name, value, rating, path, occurred_at AS occurredAt
       FROM web_vitals
       WHERE name IN ('LCP', 'INP', 'CLS')
         AND julianday(occurred_at) >= julianday('now', '-7 days')
       ORDER BY occurred_at DESC`,
    )
    .all() as Array<{
      name: CoreWebVitalName;
      value: number;
      rating: "good" | "needs-improvement" | "poor";
      path: string;
      occurredAt: string;
    }>;

  const metrics = (["LCP", "INP", "CLS"] as const).map((name) => {
    const samples = rows.filter((row) => row.name === name);
    const values = samples.map((row) => row.value).sort((left, right) => left - right);
    const percentileIndex = Math.max(Math.ceil(values.length * 0.75) - 1, 0);
    const p75 = values[percentileIndex] ?? null;
    return {
      name,
      p75,
      target: CORE_WEB_VITAL_TARGETS[name],
      sampleCount: samples.length,
      goodRate: samples.length
        ? Math.round((samples.filter((sample) => sample.rating === "good").length / samples.length) * 100)
        : null,
    };
  });

  return {
    metrics,
    sampleCount: rows.length,
    routeCount: new Set(rows.map((row) => row.path)).size,
    lastReceivedAt: rows[0]?.occurredAt ?? null,
  };
}

export function writeAudit(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, string | number | boolean> = {},
) {
  getDatabase()
    .prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(randomUUID(), userId, action, entityType, entityId, JSON.stringify(metadata), new Date().toISOString());
}

export function databaseHealth() {
  const result = getDatabase().prepare("SELECT 1 AS ok").get() as { ok: number };
  return result.ok === 1;
}
