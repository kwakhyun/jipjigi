import { NextResponse } from "next/server";
import { configuredDatabaseStore } from "@/lib/db/client";
import { databaseHealth } from "@/lib/data/repository";
import { rateLimitHealth, rateLimitStore } from "@/lib/security/request";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [databaseReady, rateLimitReady] = await Promise.all([databaseHealth(), rateLimitHealth()]);
    const databaseStore = configuredDatabaseStore();
    const productionReady = process.env.VERCEL_ENV !== "production"
      || (databaseStore === "neon" && rateLimitStore() === "redis" && rateLimitReady);
    const status = databaseReady && productionReady ? "ok" : "error";
    return NextResponse.json({
      status,
      database: databaseReady ? "ready" : "unavailable",
      databaseStore,
      rateLimitStore: rateLimitStore(),
      rateLimitReady,
      timestamp: new Date().toISOString(),
    }, { status: status === "ok" ? 200 : 503 });
  } catch {
    return NextResponse.json({ status: "error", database: "unavailable" }, { status: 503 });
  }
}
