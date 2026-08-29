import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/auth/dal";
import { recordProductEvent } from "@/lib/analytics/server";
import { assertSameOrigin, rateLimit } from "@/lib/security/request";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await sessionFromRequest(request);
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!(await rateLimit(`event:${session?.userId ?? forwarded}`, 120)).allowed) {
      return NextResponse.json({ error: "이벤트 한도를 초과했습니다." }, { status: 429 });
    }
    recordProductEvent(await request.json(), session?.userId ?? null);
    return new NextResponse(null, { status: 202 });
  } catch {
    return NextResponse.json({ error: "유효하지 않은 이벤트입니다." }, { status: 400 });
  }
}
