import "server-only";

import { WebVitalPayloadSchema } from "@/lib/performance/schema";
import { getDatabase } from "@/lib/db/client";

export async function recordWebVital(input: unknown, userId: string | null) {
  const metric = WebVitalPayloadSchema.parse(input);
  const occurredAt = new Date(metric.occurredAt);
  if (occurredAt.getTime() > Date.now() + 5 * 60_000) throw new Error("METRIC_TIME_IN_FUTURE");

  const database = await getDatabase();
  // Visibility changes can report the same document metric again. Keep its original attribution.
  await database
    .prepare(
      `INSERT INTO web_vitals (
        id, metric_id, user_id, anonymous_id, session_id, name, value, delta,
        rating, navigation_type, path, occurred_at, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (metric_id, name) DO UPDATE SET
        value = EXCLUDED.value,
        delta = EXCLUDED.delta,
        rating = EXCLUDED.rating,
        occurred_at = EXCLUDED.occurred_at,
        received_at = EXCLUDED.received_at
      WHERE EXCLUDED.occurred_at::timestamptz > web_vitals.occurred_at::timestamptz
        AND web_vitals.user_id IS NOT DISTINCT FROM EXCLUDED.user_id
        AND web_vitals.anonymous_id = EXCLUDED.anonymous_id
        AND web_vitals.session_id = EXCLUDED.session_id`,
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
