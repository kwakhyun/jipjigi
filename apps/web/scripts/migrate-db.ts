import { getDatabase, closeDatabase } from "../lib/db/client";
import { migrateDatabase } from "../lib/db/migrations";
import { seedDatabase } from "../lib/db/seed";

async function main() {
  try {
    const database = await getDatabase();
    await migrateDatabase(database);
    if (process.argv.includes("--seed-demo")) await seedDatabase(database);
    console.log("Database migrations complete.");
  } finally {
    await closeDatabase();
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
