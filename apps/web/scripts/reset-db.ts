import fs from "node:fs";
import path from "node:path";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Production database reset is disabled");
  const configured = process.env.DB_FILE ?? "../../.data/rentflow.db";
  const file = path.resolve(process.cwd(), configured);
  for (const suffix of ["", "-shm", "-wal"]) {
    const target = `${file}${suffix}`;
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
  const { getDatabase } = await import("../lib/db/client");
  getDatabase();
  console.log("RentFlow demo database reset complete.");
}

void main();
