import "server-only";
import { getDatabase } from "@/lib/db/client";
import { CORE_WEB_VITAL_TARGETS, type CoreWebVitalName } from "@/lib/performance/schema";

export async function getWebVitalsOverview(userIds?: readonly string[]) {
  const database = await getDatabase();
  const rows = await database
    .prepare(
      `SELECT name, value, rating, path, occurred_at AS occurredAt
       FROM web_vitals
       WHERE name IN ('LCP', 'INP', 'CLS') AND (?::text[] IS NULL OR user_id = ANY(?::text[]))
         AND occurred_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '7 days'
       ORDER BY occurred_at DESC`,
    )
    .all<{
      name: CoreWebVitalName;
      value: number;
      rating: "good" | "needs-improvement" | "poor";
      path: string;
      occurredAt: string;
    }>(userIds ?? null, userIds ?? null);

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
