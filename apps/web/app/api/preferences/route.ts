import { NextResponse } from "next/server";
import { NotificationPreferencesSchema } from "@jipjigi/domain";
import { sessionFromRequest } from "@/lib/auth/dal";
import { updatePreferences } from "@/lib/data/repository";
import { assertSameOrigin } from "@/lib/security/request";

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await sessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    if (session.role !== "owner") return NextResponse.json({ error: "임대인 계정에서만 사용할 수 있습니다." }, { status: 403 });
    const value = NotificationPreferencesSchema.parse(await request.json());
    return NextResponse.json({ data: updatePreferences(session.userId, value) });
  } catch {
    return NextResponse.json({ error: "설정을 저장하지 못했습니다." }, { status: 400 });
  }
}
