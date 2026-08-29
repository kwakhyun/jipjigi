import type { Metadata } from "next";
import { CheckCircledIcon, CrossCircledIcon, ExitIcon, Link2Icon } from "@radix-ui/react-icons";
import { PageHeader } from "@/components/page-header";
import { SecurityCard, SettingsForm } from "@/components/settings/settings-form";
import { requireSession } from "@/lib/auth/dal";
import { getPreferences } from "@/lib/data/repository";
import { logoutAction } from "./actions";

export const metadata: Metadata = { title: "설정" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireSession();
  const preferences = user.role === "owner" ? getPreferences(user.id) : null;
  return (
    <div className="standard-page">
      <PageHeader eyebrow={user.role === "operator" ? "운영자 도구" : "운영 설정"} title={user.role === "operator" ? "운영 설정" : "설정"} description={user.role === "operator" ? "서비스 연동과 데이터 보호 상태를 확인합니다." : "알림 및 발송 설정, 서비스 연동, 계정을 관리합니다."} />
      <div className={user.role === "operator" ? "settings-grid operator-settings-grid" : "settings-grid"}>
        {preferences ? <SettingsForm initial={{
          rentReminder: preferences.rentReminder === 1,
          renewalReminder: preferences.renewalReminder === 1,
          maintenanceUpdates: preferences.maintenanceUpdates === 1,
          marketing: preferences.marketing === 1,
          quietHoursStart: preferences.quietHoursStart,
          quietHoursEnd: preferences.quietHoursEnd,
        }} /> : null}
        <div className="settings-side-column">
          <IntegrationCard />
          {user.role === "operator" ? <SecurityCard /> : null}
          <section className="surface-card account-card"><div><span className="avatar">{user.name.slice(0, 1)}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></div><form action={logoutAction}><button className="button button-quiet" type="submit"><ExitIcon /> 로그아웃</button></form></section>
        </div>
      </div>
    </div>
  );
}

function IntegrationCard() {
  return <section className="surface-card settings-section integrations-section">
    <div className="settings-heading"><span className="settings-icon"><Link2Icon /></span><div><h2>서비스 연동</h2><p>알림톡과 계좌 데이터 연동 상태를 확인합니다.</p></div></div>
    <div className="integration-list">
      <div><span className="integration-logo">K</span><span><strong>알림톡 공급자</strong><small>테스트 연동</small></span><em className="integration-sandbox"><CheckCircledIcon /> 테스트</em></div>
      <div><span className="integration-logo bank-logo">₩</span><span><strong>계좌 입금 내역</strong><small>공급자 계약 후 연결 가능</small></span><em className="integration-off"><CrossCircledIcon /> 미연결</em></div>
    </div>
  </section>;
}
