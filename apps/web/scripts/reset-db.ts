import fs from "node:fs";
import path from "node:path";

async function main() {
  if (process.env.DATABASE_URL) throw new Error("Remote database reset is disabled; use db:migrate");
  if (process.env.NODE_ENV === "production") throw new Error("Production database reset is disabled");
  const configured = process.env.DB_DIR ?? "../../.data/jipjigi-pg";
  const directory = path.resolve(process.cwd(), configured);
  if (fs.existsSync(directory)) fs.rmSync(directory, { recursive: true, force: true });
  const { getDatabase, closeDatabase } = await import("../lib/db/client");
  const database = await getDatabase();
  const { migrateDatabase } = await import("../lib/db/migrations");
  const { seedDatabase } = await import("../lib/db/seed");
  await migrateDatabase(database);
  await seedDatabase(database);
  await closeDatabase();
  console.log("Jipjigi demo database reset complete.");
}

void main();
