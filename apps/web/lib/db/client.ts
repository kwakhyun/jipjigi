import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

type GlobalDatabase = typeof globalThis & {
  __jipjigiDatabase?: Database.Database;
};

const globalDatabase = globalThis as GlobalDatabase;

function databaseFile() {
  const configured = process.env.DB_FILE ?? "../../.data/jipjigi.db";
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), configured);
}

function seedDemoOperator(db: Database.Database) {
  const demoEnabled = process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_AUTH === "true";
  if (!demoEnabled) return;
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get("operator-1");
  if (existing) return;
  const now = new Date().toISOString();
  const insertOperator = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("operator-1", "growth@jipjigi.kr", "집지기 운영자", bcrypt.hashSync("demo1234!", 10), "operator", now);
    db.prepare(
      `INSERT INTO notification_preferences (
        user_id, rent_reminder, renewal_reminder, maintenance_updates, marketing,
        quiet_hours_start, quiet_hours_end, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("operator-1", 0, 0, 0, 0, "21:00", "08:00", now);
  });
  insertOperator();
}

function seedDatabase(db: Database.Database) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  if (existing.count > 0) {
    seedDemoOperator(db);
    return;
  }
  const demoEnabled = process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_AUTH === "true";
  if (!demoEnabled) return;

  const insertSeed = db.transaction(() => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("owner-1", "demo@jipjigi.kr", "김서준", bcrypt.hashSync("demo1234!", 10), "owner", now);

    db.prepare(
      `INSERT INTO buildings (id, owner_id, name, address, total_units, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("building-seongsu", "owner-1", "성수 리버하임", "서울 성동구 성수이로 88", 19, now);
    db.prepare(
      `INSERT INTO buildings (id, owner_id, name, address, total_units, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("building-mangwon", "owner-1", "망원 포레", "서울 마포구 희우정로 41", 8, now);

    const seongsuUnits = [
      "201", "202", "203", "301", "302", "303", "401", "402", "403", "501",
      "502", "503", "601", "602", "701", "702", "801", "802", "901",
    ];
    const unitStatement = db.prepare(
      `INSERT INTO units (id, building_id, name, floor, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const leaseStatement = db.prepare(
      `INSERT INTO leases (
        id, unit_id, tenant_name, tenant_phone_masked, contact_consent,
        start_date, end_date, deposit_amount, monthly_rent, status, renewal_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const chargeStatement = db.prepare(
      `INSERT INTO charges (
        id, lease_id, period, due_date, amount, status, paid_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    seongsuUnits.forEach((name, index) => {
      const unitId = `unit-seongsu-${name}`;
      const isVacant = name === "901";
      unitStatement.run(unitId, "building-seongsu", `${name}호`, Number(name[0]), isVacant ? "vacant" : "occupied", now);
      if (isVacant) return;

      const leaseId = `lease-seongsu-${name}`;
      const isRenewal = name === "501";
      const isOverdue = name === "203";
      leaseStatement.run(
        leaseId,
        unitId,
        isRenewal ? "이민지" : isOverdue ? "박현우" : `임차인 ${index + 1}`,
        "010-****-" + String(1200 + index).padStart(4, "0"),
        1,
        "2024-09-28",
        isRenewal ? "2026-09-27" : "2027-02-28",
        isRenewal ? 30_000_000 : 20_000_000,
        isRenewal ? 1_250_000 : isOverdue ? 980_000 : 1_100_000,
        "active",
        isRenewal ? "attention" : "none",
        now,
      );
      chargeStatement.run(
        `charge-2026-08-${name}`,
        leaseId,
        "2026-08",
        "2026-08-25",
        isRenewal ? 1_250_000 : isOverdue ? 980_000 : 1_100_000,
        isOverdue ? "overdue" : "paid",
        isOverdue ? null : "2026-08-25T02:18:00.000Z",
        now,
      );
    });

    ["201", "202", "301", "302", "401", "501", "601", "701"].forEach((name, index) => {
      const unitId = `unit-mangwon-${name}`;
      const vacant = name === "701";
      unitStatement.run(unitId, "building-mangwon", `${name}호`, Number(name[0]), vacant ? "vacant" : "occupied", now);
      if (vacant) return;
      leaseStatement.run(
        `lease-mangwon-${name}`,
        unitId,
        `임차인 M${index + 1}`,
        `010-****-${2200 + index}`,
        1,
        "2025-03-01",
        "2027-02-28",
        15_000_000,
        870_000,
        "active",
        "none",
        now,
      );
      chargeStatement.run(
        `charge-mangwon-2026-08-${name}`,
        `lease-mangwon-${name}`,
        "2026-08",
        "2026-08-25",
        870_000,
        "paid",
        "2026-08-25T01:10:00.000Z",
        now,
      );
    });

    db.prepare(
      `INSERT INTO maintenance_requests (
        id, unit_id, title, description, priority, status, requested_at, scheduled_at, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "maintenance-302",
      "unit-seongsu-302",
      "욕실 수전에서 물이 새요",
      "세면대 아래 연결부에서 물방울이 떨어집니다.",
      "normal",
      "received",
      "2026-08-29T00:20:00.000Z",
      null,
      null,
      now,
    );

    db.prepare(
      `INSERT INTO notification_preferences (
        user_id, rent_reminder, renewal_reminder, maintenance_updates, marketing,
        quiet_hours_start, quiet_hours_end, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("owner-1", 1, 1, 1, 0, "21:00", "08:00", now);

    db.prepare(
      `INSERT INTO experiment_assignments (id, user_id, experiment_key, variant, assigned_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("experiment-owner-1", "owner-1", "home_briefing_priority_v1", "risk-first", now);

    const audit = db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    audit.run("audit-seed-1", "owner-1", "rent_collected", "charge", "charge-2026-08-501", "{}", "2026-08-29T01:10:00.000Z");
    audit.run("audit-seed-2", "owner-1", "maintenance_received", "maintenance", "maintenance-302", "{}", "2026-08-29T00:20:00.000Z");
    audit.run("audit-seed-3", "owner-1", "lease_risk_detected", "lease", "lease-seongsu-501", "{}", "2026-08-28T23:00:00.000Z");
  });

  insertSeed();
  seedDemoOperator(db);
}

function initialize(db: Database.Database) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner', 'operator')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS buildings (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      total_units INTEGER NOT NULL CHECK(total_units > 0),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS buildings_owner_idx ON buildings(owner_id);
    CREATE TABLE IF NOT EXISTS units (
      id TEXT PRIMARY KEY,
      building_id TEXT NOT NULL REFERENCES buildings(id),
      name TEXT NOT NULL,
      floor INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('occupied', 'vacant', 'maintenance')),
      created_at TEXT NOT NULL,
      UNIQUE(building_id, name)
    );
    CREATE INDEX IF NOT EXISTS units_building_idx ON units(building_id);
    CREATE TABLE IF NOT EXISTS leases (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL REFERENCES units(id),
      tenant_name TEXT NOT NULL,
      tenant_phone_masked TEXT NOT NULL,
      contact_consent INTEGER NOT NULL DEFAULT 0 CHECK(contact_consent IN (0, 1)),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      deposit_amount INTEGER NOT NULL,
      monthly_rent INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'ended')),
      renewal_status TEXT NOT NULL CHECK(renewal_status IN ('none', 'attention', 'requested', 'agreed', 'ended')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS leases_unit_status_idx ON leases(unit_id, status);
    CREATE TABLE IF NOT EXISTS charges (
      id TEXT PRIMARY KEY,
      lease_id TEXT NOT NULL REFERENCES leases(id),
      period TEXT NOT NULL,
      due_date TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK(amount > 0),
      status TEXT NOT NULL CHECK(status IN ('upcoming', 'paid', 'overdue')),
      paid_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(lease_id, period)
    );
    CREATE INDEX IF NOT EXISTS charges_status_due_idx ON charges(status, due_date);
    CREATE TABLE IF NOT EXISTS maintenance_requests (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL REFERENCES units(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT NOT NULL CHECK(priority IN ('low', 'normal', 'urgent')),
      status TEXT NOT NULL CHECK(status IN ('received', 'scheduled', 'completed')),
      requested_at TEXT NOT NULL,
      scheduled_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS maintenance_status_idx ON maintenance_requests(status, requested_at);
    CREATE TABLE IF NOT EXISTS message_dispatches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      channel TEXT NOT NULL CHECK(channel IN ('sandbox_alimtalk', 'push')),
      template_key TEXT NOT NULL,
      template_version TEXT NOT NULL DEFAULT 'v1',
      idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('scheduled', 'accepted', 'delivered', 'blocked', 'failed')),
      guardrail_reason TEXT,
      scheduled_for TEXT,
      provider_message_id TEXT,
      consent_checked INTEGER NOT NULL DEFAULT 0 CHECK(consent_checked IN (0, 1)),
      retry_count INTEGER NOT NULL DEFAULT 0,
      delivered_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_entity_created_idx ON message_dispatches(entity_type, entity_id, created_at);
    CREATE TABLE IF NOT EXISTS message_delivery_events (
      id TEXT PRIMARY KEY,
      dispatch_id TEXT NOT NULL REFERENCES message_dispatches(id),
      status TEXT NOT NULL CHECK(status IN ('scheduled', 'accepted', 'delivered', 'blocked', 'failed')),
      retry_count INTEGER NOT NULL DEFAULT 0,
      provider_occurred_at TEXT,
      received_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS message_delivery_dispatch_idx ON message_delivery_events(dispatch_id, received_at);
    CREATE TABLE IF NOT EXISTS renewal_response_events (
      id TEXT PRIMARY KEY,
      dispatch_id TEXT NOT NULL REFERENCES message_dispatches(id),
      lease_id TEXT NOT NULL REFERENCES leases(id),
      response TEXT NOT NULL CHECK(response IN ('agreed', 'declined')),
      provider_occurred_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      UNIQUE(dispatch_id, response, provider_occurred_at)
    );
    CREATE INDEX IF NOT EXISTS renewal_response_lease_idx ON renewal_response_events(lease_id, provider_occurred_at);
    CREATE TABLE IF NOT EXISTS crm_opt_outs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      lease_id TEXT NOT NULL REFERENCES leases(id),
      channel TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      UNIQUE(lease_id, channel)
    );
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      rent_reminder INTEGER NOT NULL CHECK(rent_reminder IN (0, 1)),
      renewal_reminder INTEGER NOT NULL CHECK(renewal_reminder IN (0, 1)),
      maintenance_updates INTEGER NOT NULL CHECK(maintenance_updates IN (0, 1)),
      marketing INTEGER NOT NULL CHECK(marketing IN (0, 1)),
      quiet_hours_start TEXT NOT NULL,
      quiet_hours_end TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS experiment_assignments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      experiment_key TEXT NOT NULL,
      variant TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      UNIQUE(user_id, experiment_key)
    );
    CREATE TABLE IF NOT EXISTS product_events (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      anonymous_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      properties_json TEXT NOT NULL,
      release_version TEXT NOT NULL DEFAULT 'legacy',
      experiment_key TEXT,
      variant TEXT,
      user_segment TEXT NOT NULL DEFAULT 'unknown',
      occurred_at TEXT NOT NULL,
      received_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_name_time_idx ON product_events(name, occurred_at);
    CREATE TABLE IF NOT EXISTS web_vitals (
      id TEXT PRIMARY KEY,
      metric_id TEXT NOT NULL,
      user_id TEXT REFERENCES users(id),
      anonymous_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL CHECK(name IN ('CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB')),
      value REAL NOT NULL CHECK(value >= 0),
      delta REAL NOT NULL,
      rating TEXT NOT NULL CHECK(rating IN ('good', 'needs-improvement', 'poor')),
      navigation_type TEXT NOT NULL,
      path TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      received_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS web_vitals_metric_idx ON web_vitals(metric_id, name);
    CREATE INDEX IF NOT EXISTS web_vitals_name_time_idx ON web_vitals(name, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS web_vitals_path_time_idx ON web_vitals(path, occurred_at DESC);
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_user_time_idx ON audit_logs(user_id, occurred_at DESC);
  `);

  const ensureColumn = (table: string, column: string, definition: string) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };
  ensureColumn("message_dispatches", "template_version", "TEXT NOT NULL DEFAULT 'v1'");
  ensureColumn("message_dispatches", "consent_checked", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("message_dispatches", "retry_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("message_dispatches", "delivered_at", "TEXT");
  ensureColumn("product_events", "release_version", "TEXT NOT NULL DEFAULT 'legacy'");
  ensureColumn("product_events", "experiment_key", "TEXT");
  ensureColumn("product_events", "variant", "TEXT");
  ensureColumn("product_events", "user_segment", "TEXT NOT NULL DEFAULT 'unknown'");
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, ?)").run(new Date().toISOString());
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (2, ?)").run(new Date().toISOString());
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (3, ?)").run(new Date().toISOString());
  seedDatabase(db);
}

export function getDatabase() {
  if (globalDatabase.__jipjigiDatabase) return globalDatabase.__jipjigiDatabase;
  const file = databaseFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  initialize(db);
  globalDatabase.__jipjigiDatabase = db;
  return db;
}
