import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/auth/dal";
import { logger } from "@/lib/observability/logger";
import { recordWebVital } from "@/lib/performance/server";
import { assertSameOrigin, rateLimit } from "@/lib/security/request";

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id")?.slice(0, 80) || randomUUID();
  const startedAt = performance.now();
  try {
    assertSameOrigin(request);
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!(await rateLimit(`vital:${forwarded}`, 180)).allowed) {
      return NextResponse.json(
        { error: "성능 이벤트 한도를 초과했습니다." },
        { status: 429, headers: { "x-request-id": requestId } },
      );
    }
    const session = await sessionFromRequest(request);
    recordWebVital(await request.json(), session?.userId ?? null);
    logger.info("performance.vital.received", {
      requestId,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return new NextResponse(null, { status: 202, headers: { "x-request-id": requestId } });
  } catch (error) {
    logger.warn("performance.vital.rejected", {
      requestId,
      errorType: error instanceof Error ? error.name : "UnknownError",
      durationMs: Math.round(performance.now() - startedAt),
    });
    return NextResponse.json(
      { error: "유효하지 않은 성능 이벤트입니다." },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }
}
