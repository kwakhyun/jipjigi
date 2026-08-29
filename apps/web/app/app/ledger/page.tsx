import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { LedgerView } from "@/components/ledger/ledger-view";
import { requireOwner } from "@/lib/auth/dal";
import { listLedger } from "@/lib/data/repository";

export const metadata: Metadata = { title: "임대 장부" };
export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const user = await requireOwner();
  return <div className="standard-page"><PageHeader eyebrow="임대료 관리" title="임대 장부" description="입금 여부와 미납 조치를 한 화면에서 관리합니다." /><LedgerView initialRows={listLedger(user.id)} /></div>;
}
