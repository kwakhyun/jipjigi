import "server-only";
import { getDatabase } from "@/lib/db/client";


export async function getUserByEmail(email: string) {
  const database = await getDatabase();
  return database
    .prepare("SELECT id, email, name, password_hash AS passwordHash, role FROM users WHERE lower(email) = lower(?)")
    .get<{ id: string; email: string; name: string; passwordHash: string; role: "owner" | "operator" }>(email);
}
