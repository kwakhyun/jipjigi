import type { BriefingVariant } from "@jipjigi/experiments";
import { briefingPriorityExperiment } from "@jipjigi/experiments";
import type { AppDatabase } from "@/lib/db/client";

const DAY = 86_400_000;
const seongsuUnits = ["201", "202", "203", "301", "302", "303", "401", "402", "403", "501", "502", "503", "601", "602", "701", "702", "801", "802", "901"];
const mangwonUnits = ["201", "202", "301", "302", "401", "501", "601", "701"];

export function demoDates(now: Date) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
  const day = Date.parse(`${today}T00:00:00Z`);
  const offset = (days: number) => new Date(day + days * DAY).toISOString().slice(0, 10);
  return {
    today,
    period: today.slice(0, 7),
    dueDate: offset(-5),
    startDate: offset(-700),
    renewalDate: offset(28),
    regularEndDate: offset(180),
    requestedAt: new Date(now.getTime() - 30 * 60_000).toISOString(),
  };
}

// Table and column names are constants below; only values enter SQL parameters.
async function insertRows(db: AppDatabase, table: string, columns: string[], rows: unknown[][]) {
  if (!rows.length) return;
  const placeholders = rows.map((row) => `(${row.map(() => "?").join(",")})`).join(",");
  await db.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders}`).run(...rows.flat());
}

/** Immutable fixtures, never copied from the mutable shared legacy account. */
export async function seedDemoScenario(db: AppDatabase, workspaceId: string, ownerId: string, operatorId: string, variant: BriefingVariant, now: Date) {
  const id = (key: string) => `${workspaceId}:${key}`;
  const timestamp = now.toISOString();
  const dates = demoDates(now);
  const units: unknown[][] = [];
  const leases: unknown[][] = [];
  const charges: unknown[][] = [];

  await insertRows(db, "buildings", ["id", "owner_id", "name", "address", "total_units", "created_at"], [
    [id("building-seongsu"), ownerId, "성수 리버하임", "서울 성동구 성수이로 88", 19, timestamp],
    [id("building-mangwon"), ownerId, "망원 포레", "서울 마포구 희우정로 41", 8, new Date(now.getTime() + 1).toISOString()],
  ]);
  for (const [area, names] of [["seongsu", seongsuUnits], ["mangwon", mangwonUnits]] as const) {
    for (const [index, name] of names.entries()) {
      const vacant = area === "seongsu" ? name === "901" : name === "701";
      const unitId = id(`unit-${area}-${name}`);
      units.push([unitId, id(`building-${area}`), `${name}호`, Number(name[0]), vacant ? "vacant" : "occupied", timestamp]);
      if (vacant) continue;
      const renewal = area === "seongsu" && name === "501";
      const overdue = area === "seongsu" && name === "203";
      const leaseId = id(`lease-${area}-${name}`);
      const rent = area === "mangwon" ? 870_000 : renewal ? 1_250_000 : overdue ? 980_000 : 1_100_000;
      leases.push([
        leaseId, unitId, renewal ? "이민지" : overdue ? "박현우" : `임차인 ${area === "mangwon" ? "M" : ""}${index + 1}`,
        `010-****-${(area === "mangwon" ? 2200 : 1200) + index}`, 1,
        dates.startDate, renewal ? dates.renewalDate : dates.regularEndDate,
        area === "mangwon" ? 15_000_000 : renewal ? 30_000_000 : 20_000_000,
        rent, "active", renewal ? "attention" : "none", timestamp,
      ]);
      charges.push([id(`charge-${area}-${name}`), leaseId, dates.period, dates.dueDate, rent, overdue ? "overdue" : "paid", overdue ? null : timestamp, timestamp]);
    }
  }
  await insertRows(db, "units", ["id", "building_id", "name", "floor", "status", "created_at"], units);
  await insertRows(db, "leases", ["id", "unit_id", "tenant_name", "tenant_phone_masked", "contact_consent", "start_date", "end_date", "deposit_amount", "monthly_rent", "status", "renewal_status", "created_at"], leases);
  await insertRows(db, "charges", ["id", "lease_id", "period", "due_date", "amount", "status", "paid_at", "created_at"], charges);
  await insertRows(db, "maintenance_requests", ["id", "unit_id", "title", "description", "priority", "status", "requested_at", "scheduled_at", "completed_at", "updated_at"], [
    [id("maintenance-302"), id("unit-seongsu-302"), "욕실 수전에서 물이 새요", "세면대 아래 연결부에서 물방울이 떨어집니다.", "normal", "received", dates.requestedAt, null, null, timestamp],
  ]);
  await insertRows(db, "notification_preferences", ["user_id", "rent_reminder", "renewal_reminder", "maintenance_updates", "marketing", "quiet_hours_start", "quiet_hours_end", "updated_at"], [
    [ownerId, 1, 1, 1, 0, "21:00", "08:00", timestamp],
    [operatorId, 0, 0, 0, 0, "21:00", "08:00", timestamp],
  ]);
  await insertRows(db, "experiment_assignments", ["id", "user_id", "experiment_key", "variant", "assigned_at"], [
    [id("assignment"), ownerId, briefingPriorityExperiment.key, variant, timestamp],
  ]);
  await insertRows(db, "audit_logs", ["id", "user_id", "action", "entity_type", "entity_id", "metadata_json", "occurred_at"], [
    [id("audit-rent"), ownerId, "rent_collected", "charge", id("charge-seongsu-501"), "{}", timestamp],
    [id("audit-maintenance"), ownerId, "maintenance_received", "maintenance", id("maintenance-302"), "{}", dates.requestedAt],
    [id("audit-renewal"), ownerId, "lease_risk_detected", "lease", id("lease-seongsu-501"), "{}", timestamp],
  ]);
}
