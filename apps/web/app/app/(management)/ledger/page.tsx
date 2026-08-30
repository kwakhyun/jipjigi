import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { LedgerView } from "@/components/ledger/ledger-view";
import { requireOwner } from "@/lib/auth/dal";
import { listLedger } from "@/lib/data/repository";
import { QueryHydration } from "@/components/query-hydration";
import { ownerKeys } from "@/lib/query/keys";

export const metadata: Metadata = { title: "임대 장부" };
export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const user = await requireOwner();
  const rows = await listLedger(user.id);
  return <div className="standard-page"><PageHeader eyebrow="임대료 관리" title="임대 장부" description="입금 여부와 미납 조치를 한 화면에서 관리합니다." /><QueryHydration entries={[{ queryKey: ownerKeys.resource(user.id, "ledger"), data: rows }]}><LedgerView /></QueryHydration></div>;
}
