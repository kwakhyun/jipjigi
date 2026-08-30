import type { Metadata } from "next";
import { MessagesView } from "@/components/messages/messages-view";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/auth/dal";
import { listContracts, listLedger, listMessages } from "@/lib/data/repository";
import { getNotificationSettings } from "@/lib/data/notification-settings";
import { QueryHydration } from "@/components/query-hydration";
import { ownerKeys } from "@/lib/query/keys";

export const metadata: Metadata = { title: "메시지 센터" };
export const dynamic = "force-dynamic";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ target?: string | string[] }> }) {
  const user = await requireOwner();
  const [messages, contracts, charges, preferences, params] = await Promise.all([
    listMessages(user.id),
    listContracts(user.id),
    listLedger(user.id),
    getNotificationSettings(user.id),
    searchParams,
  ]);
  const target = typeof params.target === "string" ? params.target : undefined;
  const entries = [
    { queryKey: ownerKeys.resource(user.id, "messages"), data: messages },
    { queryKey: ownerKeys.resource(user.id, "contracts"), data: contracts },
    { queryKey: ownerKeys.resource(user.id, "ledger"), data: charges },
    { queryKey: ownerKeys.resource(user.id, "preferences"), data: preferences },
  ];
  return <div className="standard-page"><PageHeader eyebrow="임차인 연락" title="메시지 센터" description="전달 여부뿐 아니라 수신 동의, 발송 횟수, 발송 제한 시간까지 함께 관리합니다." /><QueryHydration entries={entries}><MessagesView key={target ?? "default"} initialTargetId={target} /></QueryHydration></div>;
}
