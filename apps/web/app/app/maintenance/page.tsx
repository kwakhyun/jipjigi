import type { Metadata } from "next";
import { MaintenanceView } from "@/components/maintenance/maintenance-view";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/auth/dal";
import { listMaintenance } from "@/lib/data/repository";

export const metadata: Metadata = { title: "수리 요청" };
export const dynamic = "force-dynamic";

export default async function MaintenancePage({ searchParams }: { searchParams: Promise<{ schedule?: string }> }) {
  const [user, query] = await Promise.all([requireOwner(), searchParams]);
  const requests = await listMaintenance(user.id);
  return <div className="standard-page"><PageHeader eyebrow="수리 운영" title="수리 요청" description="접수부터 방문 일정, 완료까지 임차인과 같은 처리 상태를 확인합니다." /><MaintenanceView initialRequests={requests} referenceTime={new Date().toISOString()} {...(query.schedule ? { initialScheduleId: query.schedule } : {})} /></div>;
}
