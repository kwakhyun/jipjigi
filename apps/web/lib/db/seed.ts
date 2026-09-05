import bcrypt from "bcryptjs";
import type { AppDatabase } from "./client";

async function seedDemoOperator(database: AppDatabase) {
  const demoEnabled = process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_AUTH === "true";
  if (!demoEnabled) return;
  const existing = await database.prepare("SELECT id FROM users WHERE id = ?").get<{ id: string }>("operator-1");
  if (existing) return;
  const now = new Date().toISOString();
  await database.transaction(async (transaction) => {
    await transaction.prepare(
      `INSERT INTO users (id, email, name, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("operator-1", "growth@jipjigi.kr", "집지기 운영자", bcrypt.hashSync("demo1234!", 10), "operator", now);
    await transaction.prepare(
      `INSERT INTO notification_preferences (
        user_id, rent_reminder, renewal_reminder, maintenance_updates, marketing,
        quiet_hours_start, quiet_hours_end, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("operator-1", 0, 0, 0, 0, "21:00", "08:00", now);
  });
}

export async function seedDatabase(database: AppDatabase) {
  await database.transaction(async (db) => {
    if (db.store === "neon") await db.query("SELECT pg_advisory_xact_lock(742719341)");
    await seedDemoData(db);
  });
}

async function seedDemoData(database: AppDatabase) {
  const existing = await database.prepare("SELECT COUNT(*)::int AS count FROM users").get<{ count: number }>();
  if ((existing?.count ?? 0) > 0) {
    await seedDemoOperator(database);
    return;
  }
  const demoEnabled = process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_AUTH === "true";
  if (!demoEnabled) return;

  await database.transaction(async (transaction) => {
    const now = new Date().toISOString();
    await transaction.prepare(
      `INSERT INTO users (id, email, name, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("owner-1", "demo@jipjigi.kr", "김서준", bcrypt.hashSync("demo1234!", 10), "owner", now);
    await transaction.prepare(
      `INSERT INTO buildings (id, owner_id, name, address, total_units, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("building-seongsu", "owner-1", "성수 리버하임", "서울 성동구 성수이로 88", 19, now);
    await transaction.prepare(
      `INSERT INTO buildings (id, owner_id, name, address, total_units, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("building-mangwon", "owner-1", "망원 포레", "서울 마포구 희우정로 41", 8, now);

    const seongsuUnits = [
      "201", "202", "203", "301", "302", "303", "401", "402", "403", "501",
      "502", "503", "601", "602", "701", "702", "801", "802", "901",
    ];
    for (const [index, name] of seongsuUnits.entries()) {
      const unitId = `unit-seongsu-${name}`;
      const isVacant = name === "901";
      await transaction.prepare(
        `INSERT INTO units (id, building_id, name, floor, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(unitId, "building-seongsu", `${name}호`, Number(name[0]), isVacant ? "vacant" : "occupied", now);
      if (isVacant) continue;

      const leaseId = `lease-seongsu-${name}`;
      const isRenewal = name === "501";
      const isOverdue = name === "203";
      await transaction.prepare(
        `INSERT INTO leases (
          id, unit_id, tenant_name, tenant_phone_masked, contact_consent,
          start_date, end_date, deposit_amount, monthly_rent, status, renewal_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        leaseId,
        unitId,
        isRenewal ? "이민지" : isOverdue ? "박현우" : `임차인 ${index + 1}`,
        `010-****-${String(1200 + index).padStart(4, "0")}`,
        1,
        "2024-09-28",
        isRenewal ? "2026-09-27" : "2027-02-28",
        isRenewal ? 30_000_000 : 20_000_000,
        isRenewal ? 1_250_000 : isOverdue ? 980_000 : 1_100_000,
        "active",
        isRenewal ? "attention" : "none",
        now,
      );
      await transaction.prepare(
        `INSERT INTO charges (id, lease_id, period, due_date, amount, status, paid_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        `charge-2026-08-${name}`,
        leaseId,
        "2026-08",
        "2026-08-25",
        isRenewal ? 1_250_000 : isOverdue ? 980_000 : 1_100_000,
        isOverdue ? "overdue" : "paid",
        isOverdue ? null : "2026-08-25T02:18:00.000Z",
        now,
      );
    }

    for (const [index, name] of ["201", "202", "301", "302", "401", "501", "601", "701"].entries()) {
      const unitId = `unit-mangwon-${name}`;
      const vacant = name === "701";
      await transaction.prepare(
        `INSERT INTO units (id, building_id, name, floor, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(unitId, "building-mangwon", `${name}호`, Number(name[0]), vacant ? "vacant" : "occupied", now);
      if (vacant) continue;
      await transaction.prepare(
        `INSERT INTO leases (
          id, unit_id, tenant_name, tenant_phone_masked, contact_consent,
          start_date, end_date, deposit_amount, monthly_rent, status, renewal_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        `lease-mangwon-${name}`, unitId, `임차인 M${index + 1}`, `010-****-${2200 + index}`, 1,
        "2025-03-01", "2027-02-28", 15_000_000, 870_000, "active", "none", now,
      );
      await transaction.prepare(
        `INSERT INTO charges (id, lease_id, period, due_date, amount, status, paid_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        `charge-mangwon-2026-08-${name}`, `lease-mangwon-${name}`, "2026-08", "2026-08-25",
        870_000, "paid", "2026-08-25T01:10:00.000Z", now,
      );
    }

    await transaction.prepare(
      `INSERT INTO maintenance_requests (
        id, unit_id, title, description, priority, status, requested_at, scheduled_at, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "maintenance-302", "unit-seongsu-302", "욕실 수전에서 물이 새요",
      "세면대 아래 연결부에서 물방울이 떨어집니다.", "normal", "received",
      "2026-08-29T00:20:00.000Z", null, null, now,
    );
    await transaction.prepare(
      `INSERT INTO notification_preferences (
        user_id, rent_reminder, renewal_reminder, maintenance_updates, marketing,
        quiet_hours_start, quiet_hours_end, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("owner-1", 1, 1, 1, 0, "21:00", "08:00", now);
    await transaction.prepare(
      `INSERT INTO experiment_assignments (id, user_id, experiment_key, variant, assigned_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("experiment-owner-1", "owner-1", "home_briefing_priority_v1", "risk-first", now);

    const audit = transaction.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    await audit.run("audit-seed-1", "owner-1", "rent_collected", "charge", "charge-2026-08-501", "{}", "2026-08-29T01:10:00.000Z");
    await audit.run("audit-seed-2", "owner-1", "maintenance_received", "maintenance", "maintenance-302", "{}", "2026-08-29T00:20:00.000Z");
    await audit.run("audit-seed-3", "owner-1", "lease_risk_detected", "lease", "lease-seongsu-501", "{}", "2026-08-28T23:00:00.000Z");
  });

  await seedDemoOperator(database);
}
