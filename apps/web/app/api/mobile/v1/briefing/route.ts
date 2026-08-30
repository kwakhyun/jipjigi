import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/auth/dal";
import { getDashboardSnapshot, getOrCreateExperimentAssignment } from "@/lib/data/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "임대인 계정에서만 사용할 수 있습니다." }, { status: 403 });
  const { searchParams } = new URL(request.url);
  try {
    const [snapshot, variant] = await Promise.all([
      getDashboardSnapshot(session.userId, searchParams.get("buildingId") ?? undefined),
      getOrCreateExperimentAssignment(session.userId),
    ]);
    return NextResponse.json(
      { data: snapshot, experiment: { key: "home_briefing_priority_v1", variant } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "브리핑을 불러오지 못했습니다." }, { status: 404 });
  }
}
