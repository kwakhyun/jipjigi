import "server-only";
import { getDatabase } from "@/lib/db/client";
import type { NotificationPreferences } from "@jipjigi/domain";
import { recordServerProductEvent } from "@/lib/analytics/server";
import { writeAudit } from "./audit";

export async function getPreferences(userId: string) {
  const database = await getDatabase();
  return database
    .prepare(
      `SELECT rent_reminder AS rentReminder, renewal_reminder AS renewalReminder,
        maintenance_updates AS maintenanceUpdates, marketing,
        quiet_hours_start AS quietHoursStart, quiet_hours_end AS quietHoursEnd
       FROM notification_preferences WHERE user_id = ?`,
    )
    .get<{
    rentReminder: 0 | 1;
    renewalReminder: 0 | 1;
    maintenanceUpdates: 0 | 1;
    marketing: 0 | 1;
    quietHoursStart: string;
    quietHoursEnd: string;
  }>(userId);
}

export async function updatePreferences(userId: string, value: NotificationPreferences) {
  const db = await getDatabase();
  return db.transaction(async (database) => {
    await database
      .prepare(
        `UPDATE notification_preferences SET rent_reminder = ?, renewal_reminder = ?,
          maintenance_updates = ?, marketing = ?, quiet_hours_start = ?, quiet_hours_end = ?, updated_at = ?
         WHERE user_id = ?`,
      )
      .run(
        Number(value.rentReminder),
        Number(value.renewalReminder),
        Number(value.maintenanceUpdates),
        Number(value.marketing),
        value.quietHoursStart,
        value.quietHoursEnd,
        new Date().toISOString(),
        userId,
      );
    await writeAudit(userId, "notification_preferences_updated", "notification_preferences", userId, {
      rentReminder: value.rentReminder,
      renewalReminder: value.renewalReminder,
      maintenanceUpdates: value.maintenanceUpdates,
      marketing: value.marketing,
    }, database);
    await recordServerProductEvent("notification_preferences_updated", userId, "/app/settings", {
      outcome: "saved",
      source: "settings",
    }, database);
    return value;
  });
}
