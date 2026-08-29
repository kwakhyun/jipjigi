import { NextResponse } from "next/server";
import { databaseHealth } from "@/lib/data/repository";
import { rateLimitStore } from "@/lib/security/request";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    return NextResponse.json({
      status: "ok",
      database: databaseHealth() ? "ready" : "unavailable",
      rateLimitStore: rateLimitStore(),
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ status: "error", database: "unavailable" }, { status: 503 });
  }
}
