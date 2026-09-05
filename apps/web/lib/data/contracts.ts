import "server-only";
import { getDatabase } from "@/lib/db/client";
import type { ContractRow, ContractTimelineEvent } from "./types";

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
    `WITH events AS (SELECT md.entity_id AS leaseId, mde.id, 'message' AS kind, mde.status,
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
     ), ranked AS (
       SELECT events.*, ROW_NUMBER() OVER (PARTITION BY "leaseId" ORDER BY "occurredAt" DESC, id DESC) AS position FROM events
     ) SELECT "leaseId", id, kind, status, "occurredAt", "retryCount" FROM ranked
       WHERE position <= 8 ORDER BY "occurredAt" DESC, id DESC`,
  ).all<ContractTimelineEvent & { leaseId: string }>(userId, userId);
  const byLease = new Map<string, ContractTimelineEvent[]>();
  for (const { leaseId, ...event } of timeline) {
    const events = byLease.get(leaseId) ?? [];
    events.push(event);
    byLease.set(leaseId, events);
  }
  return contracts.map((contract) => ({ ...contract, timeline: byLease.get(contract.id) ?? [] }));
}
