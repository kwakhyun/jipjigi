import type { AppDatabase } from "./client";

/** Explicit deploy/setup command only; runtime connections never execute DDL. */
export async function migrateDatabase(database: AppDatabase) {
  await database.transaction(async (db) => {
    if (db.store === "neon") await db.query("SELECT pg_advisory_xact_lock(742719341)");
    await db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
    const applied = await db.prepare("SELECT version FROM schema_migrations ORDER BY version").all<{ version: number }>();
    const versions = new Set(applied.map((row) => row.version));
    if (!versions.has(4)) await applyBaseline(db);
    if (!versions.has(5)) {
      await db.exec(`
        CREATE INDEX IF NOT EXISTS charges_lease_period_idx ON charges(lease_id, period);
        CREATE INDEX IF NOT EXISTS messages_user_created_idx ON message_dispatches(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS events_user_time_idx ON product_events(user_id, occurred_at DESC);
      `);
      await db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(5, new Date().toISOString());
    }
  });
}

async function applyBaseline(database: AppDatabase) {
  await database.exec(`
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
      value DOUBLE PRECISION NOT NULL CHECK(value >= 0),
      delta DOUBLE PRECISION NOT NULL,
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
    CREATE TABLE IF NOT EXISTS demo_workspaces (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL UNIQUE REFERENCES users(id),
      operator_id TEXT NOT NULL UNIQUE REFERENCES users(id),
      variant TEXT NOT NULL CHECK(variant IN ('risk-first', 'agenda-first')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS demo_workspaces_expiry_idx ON demo_workspaces(expires_at);
    ALTER TABLE message_dispatches ADD COLUMN IF NOT EXISTS template_version TEXT NOT NULL DEFAULT 'v1';
    ALTER TABLE message_dispatches ADD COLUMN IF NOT EXISTS consent_checked INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE message_dispatches ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE message_dispatches ADD COLUMN IF NOT EXISTS delivered_at TEXT;
    ALTER TABLE product_events ADD COLUMN IF NOT EXISTS release_version TEXT NOT NULL DEFAULT 'legacy';
    ALTER TABLE product_events ADD COLUMN IF NOT EXISTS experiment_key TEXT;
    ALTER TABLE product_events ADD COLUMN IF NOT EXISTS variant TEXT;
    ALTER TABLE product_events ADD COLUMN IF NOT EXISTS user_segment TEXT NOT NULL DEFAULT 'unknown';
  `);

  const now = new Date().toISOString();
  await database.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(1, now);
  await database.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(2, now);
  await database.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(3, now);
  await database.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(4, now);
}
