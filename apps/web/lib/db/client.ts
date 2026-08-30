import path from "node:path";
import bcrypt from "bcryptjs";

type QueryResult<Row> = {
  rows: Row[];
  affectedRows?: number;
  rowCount?: number | null;
};

type Queryable = {
  query(sql: string, params?: unknown[]): Promise<QueryResult<unknown>>;
  exec?(sql: string): Promise<unknown>;
};

type TransactionRunner = <Value>(callback: (queryable: Queryable) => Promise<Value>) => Promise<Value>;

type GlobalDatabase = typeof globalThis & {
  __jipjigiDatabase?: Promise<AppDatabase>;
};

const globalDatabase = globalThis as GlobalDatabase;

function postgresSql(sql: string) {
  let parameter = 0;
  const normalized = sql
    .replace(/\?/g, () => `$${++parameter}`)
    .replace(/\bAS\s+([a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)\b/g, 'AS "$1"')
    .replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.([a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)\b/g, '$1."$2"');
  if (!/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(normalized)) return normalized;
  return `${normalized.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, "INSERT INTO").replace(/;\s*$/, "")} ON CONFLICT DO NOTHING`;
}

class PreparedStatement {
  constructor(private readonly database: AppDatabase, private readonly sql: string) {}

  async get<Row>(...params: unknown[]) {
    const result = await this.database.query<Row>(this.sql, params);
    return result.rows[0];
  }

  async all<Row>(...params: unknown[]) {
    const result = await this.database.query<Row>(this.sql, params);
    return result.rows;
  }

  async run(...params: unknown[]) {
    const result = await this.database.query(this.sql, params);
    return { changes: result.affectedRows ?? result.rowCount ?? 0 };
  }
}

export class AppDatabase {
  constructor(
    private readonly queryable: Queryable,
    private readonly transactionRunner: TransactionRunner,
    private readonly closeRunner: () => Promise<void>,
    readonly store: "neon" | "pglite",
  ) {}

  prepare(sql: string) {
    return new PreparedStatement(this, postgresSql(sql));
  }

  async query<Row>(sql: string, params: unknown[] = []) {
    return this.queryable.query(postgresSql(sql), params) as Promise<QueryResult<Row>>;
  }

  async exec(sql: string) {
    const normalized = postgresSql(sql);
    return this.queryable.exec ? this.queryable.exec(normalized) : this.queryable.query(normalized);
  }

  async transaction<Value>(callback: (database: AppDatabase) => Promise<Value>) {
    return this.transactionRunner(async (queryable) => callback(new AppDatabase(
      queryable,
      async (nested) => nested(queryable),
      async () => undefined,
      this.store,
    )));
  }

  async close() {
    await this.closeRunner();
  }
}

function localDatabaseDirectory() {
  const configured = process.env.DB_DIR ?? "../../.data/jipjigi-pg";
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), configured);
}

async function executeStatements(
  query: (sql: string) => Promise<unknown>,
  sql: string,
) {
  for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
    await query(statement);
  }
}

async function createDatabase() {
  const connectionString = process.env.DATABASE_URL;
  let database: AppDatabase;

  if (connectionString) {
    const { Pool, neonConfig } = await import("@neondatabase/serverless");
    neonConfig.webSocketConstructor = globalThis.WebSocket;
    const pool = new Pool({ connectionString, max: 8, connectionTimeoutMillis: 8_000, idleTimeoutMillis: 20_000 });
    const queryable: Queryable = {
      query: (sql, params) => pool.query(sql, params) as Promise<QueryResult<unknown>>,
      exec: (sql) => executeStatements((statement) => pool.query(statement), sql),
    };
    database = new AppDatabase(
      queryable,
      async (callback) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const transactionQueryable: Queryable = {
            query: (sql, params) => client.query(sql, params) as Promise<QueryResult<unknown>>,
            exec: (sql) => executeStatements((statement) => client.query(statement), sql),
          };
          const result = await callback(transactionQueryable);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      async () => pool.end(),
      "neon",
    );
  } else {
    if (process.env.VERCEL_ENV === "production") {
      throw new Error("DATABASE_URL is required in the Vercel production environment");
    }
    const { PGlite } = await import("@electric-sql/pglite");
    const pglite = await PGlite.create(localDatabaseDirectory());
    const queryable: Queryable = {
      query: (sql, params) => pglite.query(sql, params) as Promise<QueryResult<unknown>>,
      exec: (sql) => pglite.exec(sql),
    };
    database = new AppDatabase(
      queryable,
      (callback) => pglite.transaction((transaction) => callback({
        query: (sql, params) => transaction.query(sql, params) as Promise<QueryResult<unknown>>,
        exec: (sql) => transaction.exec(sql),
      })),
      async () => pglite.close(),
      "pglite",
    );
  }

  await initialize(database);
  return database;
}

export function getDatabase() {
  globalDatabase.__jipjigiDatabase ??= createDatabase();
  return globalDatabase.__jipjigiDatabase;
}

export async function closeDatabase() {
  if (!globalDatabase.__jipjigiDatabase) return;
  const database = await globalDatabase.__jipjigiDatabase;
  await database.close();
  delete globalDatabase.__jipjigiDatabase;
}

export function configuredDatabaseStore() {
  return process.env.DATABASE_URL ? "neon" as const : "pglite" as const;
}

async function initialize(database: AppDatabase) {
  if (database.store === "neon") {
    await database.transaction(async (transaction) => {
      await transaction.query("SELECT pg_advisory_xact_lock(742719341)");
      await initializeSchemaAndSeed(transaction);
    });
    return;
  }
  await initializeSchemaAndSeed(database);
}

async function initializeSchemaAndSeed(database: AppDatabase) {
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
  await seedDatabase(database);
}

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

async function seedDatabase(database: AppDatabase) {
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
