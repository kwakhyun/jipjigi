import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/auth/dal";
import { listContracts, listLedger, listMaintenance, listMessages } from "@/lib/data/repository";
import { getNotificationSettings } from "@/lib/data/notification-settings";
import { rateLimit } from "@/lib/security/request";

const readers = { contracts: listContracts, ledger: listLedger, maintenance: listMaintenance, messages: listMessages, preferences: getNotificationSettings };
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401, headers });
    if (session.role !== "owner") return NextResponse.json({ error: "임대인 계정에서만 사용할 수 있습니다." }, { status: 403, headers });
    const { resource } = await context.params;
    if (!Object.hasOwn(readers, resource)) return NextResponse.json({ error: "조회할 수 없는 항목입니다." }, { status: 404, headers });
    if (!(await rateLimit(`workspace-read:${session.userId}`, 180)).allowed) return NextResponse.json({ error: "잠시 후 다시 확인해 주세요." }, { status: 429, headers });
    const data = await readers[resource as keyof typeof readers](session.userId);
    return NextResponse.json({ data, ownerId: session.userId }, { headers });
  } catch {
    return NextResponse.json({ error: "정보를 불러오지 못했습니다." }, { status: 500, headers });
  }
}
