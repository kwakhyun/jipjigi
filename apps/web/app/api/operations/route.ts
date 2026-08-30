import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { OperationSchema } from "@jipjigi/domain";
import { sessionFromRequest } from "@/lib/auth/dal";
import { runOperation, OperationError } from "@/lib/operations/service";
import { assertSameOrigin, rateLimit } from "@/lib/security/request";
import { logger } from "@/lib/observability/logger";

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id")?.slice(0, 80) || randomUUID();
  const startedAt = performance.now();
  try {
    assertSameOrigin(request);
    const session = await sessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401, headers: { "x-request-id": requestId } });
    if (session.role !== "owner") return NextResponse.json({ error: "임대인 계정에서만 사용할 수 있습니다." }, { status: 403, headers: { "x-request-id": requestId } });
    const limit = await rateLimit(`operation:${session.userId}`, 40);
    if (!limit.allowed) return NextResponse.json({ error: "요청이 너무 많습니다." }, { status: 429, headers: { "x-request-id": requestId } });
    const operation = OperationSchema.parse(await request.json());
    const result = await runOperation(session.userId, operation);
    logger.info("operation.completed", { requestId, userId: session.userId, operation: operation.type, durationMs: Math.round(performance.now() - startedAt) });
    return NextResponse.json({ data: result }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    if (error instanceof OperationError) {
      logger.warn("operation.rejected", { requestId, code: error.code, status: error.status });
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { "x-request-id": requestId } });
    }
    const message = error instanceof Error && error.message === "INVALID_ORIGIN" ? "허용되지 않은 요청입니다." : "요청을 처리할 수 없습니다.";
    logger.error("operation.failed", { requestId, errorType: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: message }, { status: 400, headers: { "x-request-id": requestId } });
  }
}
