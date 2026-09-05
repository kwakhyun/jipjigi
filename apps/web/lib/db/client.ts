import path from "node:path";
import { ConnectionCache } from "./connection-cache";

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
  __jipjigiConnectionCache?: ConnectionCache<AppDatabase>;
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
    // Integration tests still execute PostgreSQL, without repeated disk fsyncs.
    // Development remains file-backed; production still requires Neon above.
    const pglite = await PGlite.create(process.env.NODE_ENV === "test" ? undefined : localDatabaseDirectory());
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

  try {
    await database.query("SELECT 1");
    // Tests use isolated in-memory PostgreSQL. Every real runtime uses explicit setup.
    if (process.env.NODE_ENV === "test") {
      const { migrateDatabase } = await import("./migrations");
      const { seedDatabase } = await import("./seed");
      await migrateDatabase(database);
      await seedDatabase(database);
    }
    return database;
  } catch (error) {
    await database.close().catch(() => undefined);
    throw error;
  }
}

function connectionCache() {
  return globalDatabase.__jipjigiConnectionCache ??= new ConnectionCache(createDatabase, (db) => db.close());
}

export function getDatabase() { return connectionCache().get(); }

export async function closeDatabase() { await connectionCache().close(); }

export function configuredDatabaseStore() {
  return process.env.DATABASE_URL ? "neon" as const : "pglite" as const;
}
