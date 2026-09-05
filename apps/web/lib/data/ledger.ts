import "server-only";
import { getDatabase } from "@/lib/db/client";
import type { LedgerRow } from "./types";

export async function listLedger(userId: string) {
  const database = await getDatabase();
  return database
    .prepare(
      `SELECT c.id, c.period, c.due_date AS dueDate, c.amount, c.status, c.paid_at AS paidAt,
        u.name AS unitName, l.tenant_name AS tenantName, b.name AS buildingName
       FROM charges c
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       JOIN buildings b ON b.id = u.building_id
       WHERE b.owner_id = ? ORDER BY c.due_date DESC, b.name, u.name`,
    )
    .all<LedgerRow>(userId);
}
