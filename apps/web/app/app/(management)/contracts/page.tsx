import type { Metadata } from "next";
import { ContractsView } from "@/components/contracts/contracts-view";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/auth/dal";
import { listContracts } from "@/lib/data/repository";
import { QueryHydration } from "@/components/query-hydration";
import { ownerKeys } from "@/lib/query/keys";

export const metadata: Metadata = { title: "계약 관리" };
export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const user = await requireOwner();
  const contracts = await listContracts(user.id);
  return <div className="standard-page"><PageHeader eyebrow="임대차 계약" title="계약 관리" description="만료 예정 계약을 미리 찾고 갱신 협의 내역을 기록합니다." /><QueryHydration entries={[{ queryKey: ownerKeys.resource(user.id, "contracts"), data: contracts }]}><ContractsView referenceTime={new Date().toISOString()} /></QueryHydration></div>;
}
