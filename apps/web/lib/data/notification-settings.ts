import "server-only";

import type { NotificationPreferences } from "@jipjigi/domain";
import { getPreferences } from "./repository";

export async function getNotificationSettings(userId: string): Promise<NotificationPreferences> {
  const value = await getPreferences(userId);
  if (!value) throw new Error("NOTIFICATION_SETTINGS_NOT_FOUND");
  return { rentReminder: value.rentReminder === 1, renewalReminder: value.renewalReminder === 1, maintenanceUpdates: value.maintenanceUpdates === 1, marketing: value.marketing === 1, quietHoursStart: value.quietHoursStart, quietHoursEnd: value.quietHoursEnd };
}
