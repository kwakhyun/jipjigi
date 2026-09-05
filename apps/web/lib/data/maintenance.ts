import "server-only";
import { getDatabase } from "@/lib/db/client";
import type { MaintenanceRow } from "./types";

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
