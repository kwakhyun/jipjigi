import "server-only";
import { getDatabase } from "@/lib/db/client";
import { briefingPriorityExperiment, type BriefingVariant } from "@jipjigi/experiments";

export async function getGrowthOverview(ownerId?: string) {
  const db = await getDatabase();
  const eventCounts = await db
    .prepare(
      `SELECT name, COUNT(*)::int AS count FROM product_events
       WHERE user_id IS NOT NULL AND user_id = COALESCE(?, user_id)
         AND occurred_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '7 days'
       GROUP BY name ORDER BY count DESC`,
    )
    .all<{ name: string; count: number }>(ownerId ?? null);
  const recentEvents = await db
    .prepare(
      `SELECT id, name, path, properties_json AS propertiesJson,
        release_version AS releaseVersion, experiment_key AS experimentKey,
        variant, user_segment AS userSegment, occurred_at AS occurredAt
       FROM product_events
       WHERE user_id IS NOT NULL AND user_id = COALESCE(?, user_id)
         AND occurred_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '7 days'
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
    }>(ownerId ?? null);
  const messageStats = await db
    .prepare(
      `SELECT status, COUNT(*)::int AS count FROM message_dispatches
       WHERE user_id = COALESCE(?, user_id)
         AND created_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '7 days' GROUP BY status`,
    )
    .all<{ status: string; count: number }>(ownerId ?? null);
  const assignmentCounts = await db
    .prepare(
      `SELECT variant, COUNT(*)::int AS count FROM experiment_assignments
       WHERE experiment_key = ? AND user_id = COALESCE(?, user_id) GROUP BY variant`,
    )
    .all<{ variant: BriefingVariant; count: number }>(briefingPriorityExperiment.key, ownerId ?? null);
  const experimentResults = await db.prepare(
    `WITH exposures AS (
       SELECT user_id, variant, MIN(occurred_at) AS exposedAt
       FROM product_events
       WHERE experiment_key = ? AND name = 'experiment_exposed' AND user_id = COALESCE(?, user_id)
         AND user_id IS NOT NULL AND user_segment = 'owner'
         AND occurred_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '7 days'
         AND variant IN ('risk-first', 'agenda-first')
         AND user_id NOT IN (
           SELECT user_id FROM product_events WHERE experiment_key = ? AND name = 'experiment_exposed' AND user_id IS NOT NULL
           GROUP BY user_id HAVING COUNT(DISTINCT variant) > 1
         )
       GROUP BY user_id, variant
     ), converted AS (
       SELECT DISTINCT e.user_id, e.variant
       FROM exposures e JOIN product_events action ON action.user_id = e.user_id
       WHERE action.name IN ('renewal_started', 'overdue_notice_requested', 'payment_marked', 'maintenance_updated')
         AND action.experiment_key = ? AND action.variant = e.variant
         AND action.occurred_at::timestamptz BETWEEN e.exposedAt::timestamptz AND e.exposedAt::timestamptz + INTERVAL '24 hours'
     )
     SELECT e.variant, COUNT(*)::int AS exposedUsers, COUNT(c.user_id)::int AS actionUsers
     FROM exposures e LEFT JOIN converted c ON c.user_id = e.user_id AND c.variant = e.variant
     GROUP BY e.variant ORDER BY e.variant`,
  ).all<{ variant: BriefingVariant; exposedUsers: number; actionUsers: number }>(briefingPriorityExperiment.key, ownerId ?? null, briefingPriorityExperiment.key, briefingPriorityExperiment.key);
  const deliveredRecipients = await db.prepare(
    `SELECT COUNT(DISTINCT CASE WHEN md.entity_type = 'lease' THEN md.entity_id ELSE c.lease_id END)::int AS count
     FROM message_dispatches md LEFT JOIN charges c ON md.entity_type = 'charge' AND c.id = md.entity_id
     WHERE md.user_id = COALESCE(?, md.user_id) AND md.status = 'delivered'
       AND md.delivered_at::timestamptz BETWEEN CURRENT_TIMESTAMP - INTERVAL '7 days' AND CURRENT_TIMESTAMP`,
  ).get<{ count: number }>(ownerId ?? null);
  const optOuts = await db.prepare(
    `SELECT COUNT(DISTINCT o.lease_id)::int AS count
     FROM crm_opt_outs o
     WHERE o.user_id = COALESCE(?, o.user_id) AND o.occurred_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '7 days'
       AND EXISTS (
         SELECT 1 FROM message_dispatches md
         LEFT JOIN charges c ON md.entity_type = 'charge' AND c.id = md.entity_id
         WHERE md.status = 'delivered' AND md.delivered_at::timestamptz BETWEEN CURRENT_TIMESTAMP - INTERVAL '7 days' AND CURRENT_TIMESTAMP
           AND (CASE WHEN md.entity_type = 'lease' THEN md.entity_id ELSE c.lease_id END) = o.lease_id
           AND o.channel = md.channel
           AND o.occurred_at::timestamptz BETWEEN md.delivered_at::timestamptz
             AND LEAST(CURRENT_TIMESTAMP, md.delivered_at::timestamptz + INTERVAL '7 days')
       )`,
  ).get<{ count: number }>(ownerId ?? null);
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
