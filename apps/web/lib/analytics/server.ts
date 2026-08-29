import "server-only";

import { ProductEventSchema, sanitizeProperties } from "@rentflow/analytics";
import { getDatabase } from "@/lib/db/client";

export function recordProductEvent(input: unknown, userId: string | null) {
  const event = ProductEventSchema.parse(input);
  const occurredAt = new Date(event.occurredAt);
  if (occurredAt.getTime() > Date.now() + 5 * 60_000) throw new Error("EVENT_TIME_IN_FUTURE");

  getDatabase()
    .prepare(
      `INSERT OR IGNORE INTO product_events (
        id, user_id, anonymous_id, session_id, name, path, properties_json, occurred_at, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      event.eventId,
      userId,
      event.anonymousId,
      event.sessionId,
      event.name,
      event.path,
      JSON.stringify(sanitizeProperties(event.properties)),
      event.occurredAt,
      new Date().toISOString(),
    );
}
