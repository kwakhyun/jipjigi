import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { Providers } from "@/components/providers";
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
    <Providers>
      <DashboardView initial={{ data: snapshot, experiment: { key: "home_briefing_priority_v1", variant } }} buildings={buildings} userName={user.name} />
    </Providers>
  );
}
