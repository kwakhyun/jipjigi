import "server-only";

import { WebVitalPayloadSchema } from "@/lib/performance/schema";
import { getDatabase } from "@/lib/db/client";

export function recordWebVital(input: unknown, userId: string | null) {
  const metric = WebVitalPayloadSchema.parse(input);
  const occurredAt = new Date(metric.occurredAt);
  if (occurredAt.getTime() > Date.now() + 5 * 60_000) throw new Error("METRIC_TIME_IN_FUTURE");

  getDatabase()
    .prepare(
      `INSERT OR IGNORE INTO web_vitals (
        id, metric_id, user_id, anonymous_id, session_id, name, value, delta,
        rating, navigation_type, path, occurred_at, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      metric.id,
      metric.metricId,
      userId,
      metric.anonymousId,
      metric.sessionId,
      metric.name,
      metric.value,
      metric.delta,
      metric.rating,
      metric.navigationType,
      metric.path,
      metric.occurredAt,
      new Date().toISOString(),
    );
}
