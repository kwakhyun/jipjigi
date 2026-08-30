import "server-only";

import { randomUUID } from "node:crypto";
import { ProductEventSchema, sanitizeProperties, type EventName } from "@jipjigi/analytics";
import { getDatabase } from "@/lib/db/client";

function releaseVersion() {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? process.env.npm_package_version ?? "local";
}

export async function recordProductEvent(input: unknown, userId: string | null) {
  const event = ProductEventSchema.parse(input);
  const occurredAt = new Date(event.occurredAt);
  if (occurredAt.getTime() > Date.now() + 5 * 60_000) throw new Error("EVENT_TIME_IN_FUTURE");

  const db = await getDatabase();
  const assignment = userId
    ? await db.prepare("SELECT experiment_key AS experimentKey, variant FROM experiment_assignments WHERE user_id = ? ORDER BY assigned_at DESC LIMIT 1").get<{ experimentKey: string; variant: string }>(userId)
    : undefined;
  const user = userId ? await db.prepare("SELECT role FROM users WHERE id = ?").get<{ role: string }>(userId) : undefined;

  await db
    .prepare(
      `INSERT OR IGNORE INTO product_events (
        id, user_id, anonymous_id, session_id, name, path, properties_json,
        release_version, experiment_key, variant, user_segment, occurred_at, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      event.eventId,
      userId,
      event.anonymousId,
      event.sessionId,
      event.name,
      event.path,
      JSON.stringify(sanitizeProperties(event.properties)),
      releaseVersion(),
      event.context.experimentKey ?? assignment?.experimentKey ?? null,
      event.context.variant ?? assignment?.variant ?? null,
      user?.role ?? event.context.userSegment,
      event.occurredAt,
      new Date().toISOString(),
    );
}

export async function recordServerProductEvent(
  name: EventName,
  userId: string,
  path: string,
  properties: Record<string, string | number | boolean | null> = {},
) {
  const db = await getDatabase();
  const assignment = await db
    .prepare("SELECT experiment_key AS experimentKey, variant FROM experiment_assignments WHERE user_id = ? ORDER BY assigned_at DESC LIMIT 1")
    .get<{ experimentKey: string; variant: string }>(userId);
  const user = await db.prepare("SELECT role FROM users WHERE id = ?").get<{ role: string }>(userId);
  const eventId = randomUUID();
  await recordProductEvent({
    eventId,
    name,
    anonymousId: `server:${userId}`,
    sessionId: "server-operation",
    path,
    occurredAt: new Date().toISOString(),
    context: {
      releaseVersion: releaseVersion(),
      experimentKey: assignment?.experimentKey ?? null,
      variant: assignment?.variant ?? null,
      userSegment: user?.role ?? "unknown",
    },
    properties,
  }, userId);
  return eventId;
}
