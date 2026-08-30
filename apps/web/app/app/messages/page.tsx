import type { Metadata } from "next";
import { MessagesView } from "@/components/messages/messages-view";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/auth/dal";
import { listContracts, listLedger, listMessages } from "@/lib/data/repository";

export const metadata: Metadata = { title: "메시지 센터" };
export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const user = await requireOwner();
  const [messages, contracts, charges] = await Promise.all([
    listMessages(user.id),
    listContracts(user.id),
    listLedger(user.id),
  ]);
  return <div className="standard-page"><PageHeader eyebrow="임차인 연락" title="메시지 센터" description="전달 여부뿐 아니라 수신 동의, 발송 횟수, 발송 제한 시간까지 함께 관리합니다." /><MessagesView initialMessages={messages} contracts={contracts} charges={charges} /></div>;
}
