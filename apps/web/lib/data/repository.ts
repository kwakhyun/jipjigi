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

export async function getUserByEmail(email: string) {
  const database = await getDatabase();
  return database
    .prepare("SELECT id, email, name, password_hash AS passwordHash, role FROM users WHERE lower(email) = lower(?)")
    .get<{ id: string; email: string; name: string; passwordHash: string; role: "owner" | "operator" }>(email);
}

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

async function ownedBuilding(userId: string, buildingId?: string) {
  const db = await getDatabase();
  const requested = buildingId
    ? await db
      .prepare("SELECT id, name, address, total_units AS totalUnits FROM buildings WHERE id = ? AND owner_id = ?")
      .get<{ id: string; name: string; address: string; totalUnits: number }>(buildingId, userId)
    : await db
      .prepare("SELECT id, name, address, total_units AS totalUnits FROM buildings WHERE owner_id = ? ORDER BY CASE WHEN id = 'building-seongsu' THEN 0 ELSE 1 END, created_at LIMIT 1")
      .get<{ id: string; name: string; address: string; totalUnits: number }>(userId);
  if (!requested) throw new Error("BUILDING_NOT_FOUND");
  return requested;
}

export async function getDashboardSnapshot(userId: string, buildingId?: string): Promise<DashboardSnapshot> {
  const db = await getDatabase();
  const building = await ownedBuilding(userId, buildingId);
  const occupancy = await db
    .prepare(
        `SELECT SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END)::int AS occupiedUnits
       FROM units WHERE building_id = ?`,
    )
    .get<{ occupiedUnits: number | null }>(building.id);
  const latestPeriod = await db
    .prepare(
      `SELECT MAX(c.period) AS period FROM charges c
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       WHERE u.building_id = ?`,
    )
    .get<{ period: string | null }>(building.id);
  const money = await db
    .prepare(
      `SELECT COALESCE(SUM(c.amount), 0)::int AS expectedAmount,
        COALESCE(SUM(CASE WHEN c.status = 'paid' THEN c.amount ELSE 0 END), 0)::int AS collectedAmount
       FROM charges c
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       WHERE u.building_id = ? AND c.period = ?`,
    )
    .get<{ expectedAmount: number; collectedAmount: number }>(building.id, latestPeriod?.period ?? "");
  const openMaintenance = await db
    .prepare(
      `SELECT COUNT(*)::int AS count FROM maintenance_requests m
       JOIN units u ON u.id = m.unit_id
       WHERE u.building_id = ? AND m.status != 'completed'`,
    )
    .get<{ count: number }>(building.id);

  const renewal = await db
    .prepare(
      `SELECT l.id AS leaseId, u.name AS unitName, l.tenant_name AS tenantName,
        (l.end_date::date - (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date)::int AS daysLeft,
        l.deposit_amount AS currentDeposit, l.monthly_rent AS currentRent,
        CAST(ROUND(l.monthly_rent * 1.04 / 10000) * 10000 AS INTEGER) AS suggestedRent,
        l.renewal_status AS status
       FROM leases l JOIN units u ON u.id = l.unit_id
       WHERE u.building_id = ? AND l.status = 'active' AND l.renewal_status IN ('attention', 'requested')
       ORDER BY l.end_date ASC LIMIT 1`,
    )
    .get<NonNullable<DashboardSnapshot["briefing"]["renewal"]>>(building.id);

  const overdue = await db
    .prepare(
      `SELECT c.id AS chargeId, u.name AS unitName, l.tenant_name AS tenantName,
        c.amount,
        (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - c.due_date::date))::int AS daysOverdue,
        COALESCE((SELECT md.status FROM message_dispatches md
          WHERE md.entity_type = 'charge' AND md.entity_id = c.id
          ORDER BY md.created_at DESC LIMIT 1), 'not_sent') AS noticeStatus
       FROM charges c
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       WHERE u.building_id = ? AND c.status = 'overdue'
       ORDER BY c.due_date ASC LIMIT 1`,
    )
    .get<NonNullable<DashboardSnapshot["briefing"]["overdue"]>>(building.id);

  const maintenance = await db
    .prepare(
      `SELECT m.id AS requestId, u.name AS unitName, m.title, m.status,
        m.requested_at AS requestedAt
       FROM maintenance_requests m JOIN units u ON u.id = m.unit_id
       WHERE u.building_id = ? AND m.status != 'completed'
       ORDER BY CASE m.priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
         m.requested_at ASC LIMIT 1`,
    )
    .get<NonNullable<DashboardSnapshot["briefing"]["maintenance"]>>(building.id);

  const activityRows = await db
    .prepare(
      `SELECT id, action, entity_type AS entityType, entity_id AS entityId, occurred_at AS occurredAt
       FROM audit_logs WHERE user_id = ? ORDER BY occurred_at DESC LIMIT 6`,
    )
    .all<{ id: string; action: string; entityType: string; entityId: string; occurredAt: string }>(userId);
  const activityMap: Record<string, { label: string; detail: string; tone: "positive" | "neutral" | "warning" }> = {
    rent_collected: { label: "월세 입금 확인", detail: "납부 상태가 자동으로 반영됐어요", tone: "positive" },
    maintenance_received: { label: "수리 요청 접수", detail: "302호 요청 내용을 확인해 주세요", tone: "neutral" },
    lease_risk_detected: { label: "계약 만료 임박", detail: "501호 계약 갱신 여부를 확인해 주세요", tone: "warning" },
    payment_marked: { label: "입금 직접 확인", detail: "장부 상태를 납부 완료로 변경했어요", tone: "positive" },
    overdue_notice_sent: { label: "미납 안내 접수", detail: "발송 제한을 확인하고 접수했어요", tone: "neutral" },
    renewal_started: { label: "갱신 협의 시작", detail: "임차인에게 확인 요청을 보냈어요", tone: "neutral" },
    maintenance_updated: { label: "수리 상태 변경", detail: "처리 상태를 변경했어요", tone: "positive" },
  };

  const occupiedUnits = occupancy?.occupiedUnits ?? 0;
  return {
    generatedAt: new Date().toISOString(),
    building: { ...building, occupiedUnits },
    metrics: {
      collectionRate: !money?.expectedAmount ? 0 : Math.round((money.collectedAmount / money.expectedAmount) * 1000) / 10,
      collectedAmount: money?.collectedAmount ?? 0,
      expectedAmount: money?.expectedAmount ?? 0,
      occupiedRate: Math.round((occupiedUnits / building.totalUnits) * 1000) / 10,
      openMaintenance: openMaintenance?.count ?? 0,
    },
    briefing: { renewal: renewal ?? null, overdue: overdue ?? null, maintenance: maintenance ?? null },
    recentActivities: activityRows.map((row) => ({
      id: row.id,
      ...(activityMap[row.action] ?? { label: row.action, detail: `${row.entityType} 정보가 변경됐어요`, tone: "neutral" as const }),
      occurredAt: row.occurredAt,
    })),
  };
}

export async function listLedger(userId: string) {
  const database = await getDatabase();
  return database
    .prepare(
      `SELECT c.id, c.period, c.due_date AS dueDate, c.amount, c.status, c.paid_at AS paidAt,
        u.name AS unitName, l.tenant_name AS tenantName, b.name AS buildingName
       FROM charges c
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       JOIN buildings b ON b.id = u.building_id
       WHERE b.owner_id = ? ORDER BY c.due_date DESC, b.name, u.name`,
    )
    .all<LedgerRow>(userId);
}

export async function listContracts(userId: string) {
  const db = await getDatabase();
  const contracts = await db
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
    .all<Omit<ContractRow, "timeline">>(userId);
  const timeline = await db.prepare(
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
  ).all<ContractTimelineEvent & { leaseId: string }>(userId, userId);
  return contracts.map((contract) => ({
    ...contract,
    timeline: timeline.filter((event) => event.leaseId === contract.id).slice(0, 8).map(({ leaseId: _leaseId, ...event }) => event),
  }));
}

export async function listMaintenance(userId: string) {
  const database = await getDatabase();
  return database
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
    .all<MaintenanceRow>(userId);
}

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

export async function getPreferences(userId: string) {
  const database = await getDatabase();
  return database
    .prepare(
      `SELECT rent_reminder AS rentReminder, renewal_reminder AS renewalReminder,
        maintenance_updates AS maintenanceUpdates, marketing,
        quiet_hours_start AS quietHoursStart, quiet_hours_end AS quietHoursEnd
       FROM notification_preferences WHERE user_id = ?`,
    )
    .get<{
    rentReminder: 0 | 1;
    renewalReminder: 0 | 1;
    maintenanceUpdates: 0 | 1;
    marketing: 0 | 1;
    quietHoursStart: string;
    quietHoursEnd: string;
  }>(userId);
}

export async function updatePreferences(userId: string, value: NotificationPreferences) {
  const database = await getDatabase();
  await database
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
  await writeAudit(userId, "notification_preferences_updated", "notification_preferences", userId, {
    rentReminder: value.rentReminder,
    renewalReminder: value.renewalReminder,
    maintenanceUpdates: value.maintenanceUpdates,
    marketing: value.marketing,
  });
  await recordServerProductEvent("notification_preferences_updated", userId, "/app/settings", {
    outcome: "saved",
    source: "settings",
  });
  return value;
}

export async function getOrCreateExperimentAssignment(userId: string): Promise<BriefingVariant> {
  const db = await getDatabase();
  const existing = await db
    .prepare("SELECT variant FROM experiment_assignments WHERE user_id = ? AND experiment_key = ?")
    .get<{ variant: BriefingVariant }>(userId, briefingPriorityExperiment.key);
  if (existing) return existing.variant;
  const variant = assignVariant(briefingPriorityExperiment, userId);
  await db.prepare(
    `INSERT INTO experiment_assignments (id, user_id, experiment_key, variant, assigned_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(randomUUID(), userId, briefingPriorityExperiment.key, variant, new Date().toISOString());
  return variant;
}

export async function getGrowthOverview() {
  const db = await getDatabase();
  const eventCounts = await db
    .prepare(
      `SELECT name, COUNT(*)::int AS count FROM product_events
       WHERE user_id IS NOT NULL AND occurred_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '7 days'
       GROUP BY name ORDER BY count DESC`,
    )
    .all<{ name: string; count: number }>();
  const recentEvents = await db
    .prepare(
      `SELECT id, name, path, properties_json AS propertiesJson,
        release_version AS releaseVersion, experiment_key AS experimentKey,
        variant, user_segment AS userSegment, occurred_at AS occurredAt
       FROM product_events
       WHERE user_id IS NOT NULL AND occurred_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '7 days'
       ORDER BY occurred_at DESC LIMIT 20`,
    )
    .all<{
      id: string;
      name: string;
      path: string;
      propertiesJson: string;
      releaseVersion: string;
      experimentKey: string | null;
      variant: string | null;
      userSegment: string;
      occurredAt: string;
    }>();
  const messageStats = await db
    .prepare(
      `SELECT status, COUNT(*)::int AS count FROM message_dispatches
       WHERE created_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '7 days' GROUP BY status`,
    )
    .all<{ status: string; count: number }>();
  const assignmentCounts = await db
    .prepare(
      `SELECT variant, COUNT(*)::int AS count FROM experiment_assignments
       WHERE experiment_key = ? GROUP BY variant`,
    )
    .all<{ variant: BriefingVariant; count: number }>(briefingPriorityExperiment.key);
  const experimentResults = await db.prepare(
    `WITH exposures AS (
       SELECT user_id, variant, MIN(occurred_at) AS exposedAt
       FROM product_events
       WHERE experiment_key = ? AND name = 'experiment_exposed'
         AND occurred_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '7 days'
         AND variant IN ('risk-first', 'agenda-first')
       GROUP BY user_id, variant
     ), converted AS (
       SELECT DISTINCT e.user_id, e.variant
       FROM exposures e JOIN product_events action ON action.user_id = e.user_id
       WHERE action.name IN ('renewal_started', 'overdue_notice_requested', 'payment_marked', 'maintenance_updated')
         AND action.occurred_at::timestamptz BETWEEN e.exposedAt::timestamptz AND e.exposedAt::timestamptz + INTERVAL '24 hours'
     )
     SELECT e.variant, COUNT(*)::int AS exposedUsers, COUNT(c.user_id)::int AS actionUsers
     FROM exposures e LEFT JOIN converted c ON c.user_id = e.user_id AND c.variant = e.variant
     GROUP BY e.variant ORDER BY e.variant`,
  ).all<{ variant: BriefingVariant; exposedUsers: number; actionUsers: number }>(briefingPriorityExperiment.key);
  const deliveredRecipients = await db.prepare(
    `SELECT COUNT(DISTINCT CASE WHEN md.entity_type = 'lease' THEN md.entity_id ELSE c.lease_id END)::int AS count
     FROM message_dispatches md LEFT JOIN charges c ON md.entity_type = 'charge' AND c.id = md.entity_id
     WHERE md.status = 'delivered' AND md.delivered_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '7 days'`,
  ).get<{ count: number }>();
  const optOuts = await db.prepare(
    `SELECT COUNT(DISTINCT o.lease_id)::int AS count
     FROM crm_opt_outs o
     WHERE o.occurred_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '7 days'
       AND EXISTS (
         SELECT 1 FROM message_dispatches md
         LEFT JOIN charges c ON md.entity_type = 'charge' AND c.id = md.entity_id
         WHERE md.status = 'delivered' AND md.delivered_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '7 days'
           AND (CASE WHEN md.entity_type = 'lease' THEN md.entity_id ELSE c.lease_id END) = o.lease_id
       )`,
  ).get<{ count: number }>();
  const acceptedAttempts = messageStats
    .filter((item) => ["accepted", "delivered", "failed"].includes(item.status))
    .reduce((sum, item) => sum + item.count, 0);
  const deliveredMessages = messageStats.find((item) => item.status === "delivered")?.count ?? 0;
  const blockedMessages = messageStats.find((item) => item.status === "blocked")?.count ?? 0;
  const totalRequests = messageStats.reduce((sum, item) => sum + item.count, 0);
  const crmGuardrails = {
    deliveryRate: acceptedAttempts ? Math.round((deliveredMessages / acceptedAttempts) * 1000) / 10 : null,
    optOutRate: deliveredRecipients?.count ? Math.round(((optOuts?.count ?? 0) / deliveredRecipients.count) * 1000) / 10 : null,
    blockedRate: totalRequests ? Math.round((blockedMessages / totalRequests) * 1000) / 10 : null,
    deliveredRecipients: deliveredRecipients?.count ?? 0,
    optOuts: optOuts?.count ?? 0,
  };
  return { assignmentCounts, experimentResults, eventCounts, recentEvents, messageStats, crmGuardrails };
}

export async function getWebVitalsOverview() {
  const database = await getDatabase();
  const rows = await database
    .prepare(
      `SELECT name, value, rating, path, occurred_at AS occurredAt
       FROM web_vitals
       WHERE name IN ('LCP', 'INP', 'CLS')
         AND occurred_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '7 days'
       ORDER BY occurred_at DESC`,
    )
    .all<{
      name: CoreWebVitalName;
      value: number;
      rating: "good" | "needs-improvement" | "poor";
      path: string;
      occurredAt: string;
    }>();

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

export async function writeAudit(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, string | number | boolean> = {},
) {
  const database = await getDatabase();
  await database
    .prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(randomUUID(), userId, action, entityType, entityId, JSON.stringify(metadata), new Date().toISOString());
}

export async function databaseHealth() {
  const database = await getDatabase();
  const result = await database.prepare("SELECT 1 AS ok").get<{ ok: number }>();
  return result?.ok === 1;
}
