import fs from "node:fs";
import path from "node:path";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Production database reset is disabled");
  const configured = process.env.DB_DIR ?? "../../.data/jipjigi-pg";
  const directory = path.resolve(process.cwd(), configured);
  if (fs.existsSync(directory)) fs.rmSync(directory, { recursive: true, force: true });
  const { getDatabase } = await import("../lib/db/client");
  await getDatabase();
  console.log("Jipjigi demo database reset complete.");
}

void main();
