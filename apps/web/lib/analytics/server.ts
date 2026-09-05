import "server-only";

import { randomUUID } from "node:crypto";
import { BrowserEventNameSchema, ProductEventSchema, sanitizeProperties, type EventName } from "@jipjigi/analytics";
import { briefingPriorityExperiment } from "@jipjigi/experiments";
import { getDatabase, type AppDatabase } from "@/lib/db/client";

function releaseVersion() {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? process.env.npm_package_version ?? "local";
}

export async function recordProductEvent(input: unknown, userId: string | null, database?: AppDatabase) {
  const event = ProductEventSchema.parse(input);
  const occurredAt = new Date(event.occurredAt);
  if (occurredAt.getTime() > Date.now() + 5 * 60_000) throw new Error("EVENT_TIME_IN_FUTURE");

  const db = database ?? await getDatabase();
  const assignment = userId
    ? await db.prepare("SELECT experiment_key AS experimentKey, variant FROM experiment_assignments WHERE user_id = ? AND experiment_key = ?").get<{ experimentKey: string; variant: string }>(userId, briefingPriorityExperiment.key)
    : undefined;
  const user = userId ? await db.prepare("SELECT role FROM users WHERE id = ?").get<{ role: string }>(userId) : undefined;
  if (userId && !user) throw new Error("EVENT_USER_NOT_FOUND");
  if (event.name === "experiment_exposed" && (!assignment || user?.role !== "owner")) {
    throw new Error("EVENT_ASSIGNMENT_REQUIRED");
  }
  const properties = sanitizeProperties(event.properties);
  // The browser is not an authority for either the envelope or its duplicated properties.
  delete properties.experiment_key;
  delete properties.variant;
  if (event.name === "experiment_exposed" && assignment) {
    properties.experiment_key = assignment.experimentKey;
    properties.variant = assignment.variant;
  }

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
      JSON.stringify(properties),
      releaseVersion(),
      assignment?.experimentKey ?? null,
      assignment?.variant ?? null,
      user?.role ?? "anonymous",
      event.occurredAt,
      new Date().toISOString(),
    );
}

export async function recordBrowserProductEvent(input: unknown, userId: string | null) {
  const event = ProductEventSchema.parse(input);
  BrowserEventNameSchema.parse(event.name);
  if (!userId && event.name !== "seo_cta_clicked") throw new Error("EVENT_AUTH_REQUIRED");
  if (Date.parse(event.occurredAt) < Date.now() - 24 * 60 * 60_000) throw new Error("EVENT_TOO_OLD");
  await recordProductEvent(event, userId);
}

export async function recordServerProductEvent(
  name: EventName,
  userId: string,
  path: string,
  properties: Record<string, string | number | boolean | null> = {},
  database?: AppDatabase,
) {
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
      experimentKey: null,
      variant: null,
      userSegment: "unknown",
    },
    properties,
  }, userId, database);
  return eventId;
}
