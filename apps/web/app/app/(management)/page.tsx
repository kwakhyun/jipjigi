import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { QueryHydration } from "@/components/query-hydration";
import { ownerKeys } from "@/lib/query/keys";
import { requireOwner } from "@/lib/auth/dal";
import { getDashboardSnapshot, getOrCreateExperimentAssignment, listBuildings } from "@/lib/data/repository";

export const metadata: Metadata = { title: "오늘의 브리핑" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireOwner();
  const buildings = await listBuildings(user.id);
  const [snapshot, variant] = await Promise.all([
    getDashboardSnapshot(user.id, buildings[0]?.id),
    getOrCreateExperimentAssignment(user.id),
  ]);
  return (
    <QueryHydration entries={[{ queryKey: ownerKeys.briefing(user.id, snapshot.building.id), data: { data: snapshot, experiment: { key: "home_briefing_priority_v1", variant } } }]}>
      <DashboardView initialBuildingId={snapshot.building.id} buildings={buildings} userName={user.name} />
    </QueryHydration>
  );
}
