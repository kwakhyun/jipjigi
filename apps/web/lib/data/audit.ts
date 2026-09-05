import "server-only";
import { getDatabase, type AppDatabase } from "@/lib/db/client";
import { randomUUID } from "node:crypto";

export async function writeAudit(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, string | number | boolean> = {},
  db?: AppDatabase,
) {
  const database = db ?? await getDatabase();
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
