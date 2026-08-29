"use client";

import { useState, useTransition } from "react";
import { CheckCircledIcon, ClockIcon, LockClosedIcon } from "@radix-ui/react-icons";
import { savePreferencesAction } from "@/app/app/actions";
import { useTransientMessage } from "@/lib/hooks/use-transient-message";

type Settings = {
  rentReminder: boolean;
  renewalReminder: boolean;
  maintenanceUpdates: boolean;
  marketing: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};

export function SettingsForm({ initial }: { initial: Settings }) {
  const [value, setValue] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [status, showStatus] = useTransientMessage(2_500);

  const save = () => {
    startTransition(async () => {
      const result = await savePreferencesAction(value);
      showStatus(result.ok ? "변경 사항을 저장했어요." : result.error);
    });
  };

  return (
    <section className="surface-card settings-section" aria-labelledby="notification-title">
      <div className="settings-heading"><span className="settings-icon"><ClockIcon /></span><div><h2 id="notification-title">알림 및 발송 설정</h2><p>운영 알림과 임차인 메시지 발송 기준을 설정합니다.</p></div></div>
      <div className="toggle-list">
        <Toggle label="임대료 미납 감지" description="기한이 지나면 임대인에게 조치 카드를 보여줍니다." checked={value.rentReminder} onChange={(checked) => setValue((current) => ({ ...current, rentReminder: checked }))} />
        <Toggle label="계약 갱신 알림" description="만료 60일 전부터 위험 브리핑에 표시합니다." checked={value.renewalReminder} onChange={(checked) => setValue((current) => ({ ...current, renewalReminder: checked }))} />
        <Toggle label="수리 상태 알림" description="접수, 방문 일정, 완료 단계가 바뀌면 알려드립니다." checked={value.maintenanceUpdates} onChange={(checked) => setValue((current) => ({ ...current, maintenanceUpdates: checked }))} />
        <Toggle label="제품 소식과 혜택" description="운영 알림과 별도로 동의할 수 있습니다." checked={value.marketing} onChange={(checked) => setValue((current) => ({ ...current, marketing: checked }))} />
      </div>
      <div className="quiet-hours-form">
        <div><strong>발송 제한 시간</strong><p>이 시간에는 임차인 메시지를 보내지 않고 다음 발송 가능 시간으로 예약합니다.</p></div>
        <label><span>시작</span><input type="time" value={value.quietHoursStart} onChange={(event) => setValue((current) => ({ ...current, quietHoursStart: event.target.value }))} /></label>
        <span aria-hidden="true">~</span>
        <label><span>종료</span><input type="time" value={value.quietHoursEnd} onChange={(event) => setValue((current) => ({ ...current, quietHoursEnd: event.target.value }))} /></label>
      </div>
      <div className="settings-save-row">
        <span role="status">{status ? <>{status === "변경 사항을 저장했어요." ? <CheckCircledIcon /> : null} {status}</> : null}</span>
        <button className="button button-primary" type="button" disabled={isPending} onClick={save}>{isPending ? "저장 중…" : "변경 사항 저장"}</button>
      </div>
    </section>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="toggle-row"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="toggle-control" aria-hidden="true" /></label>;
}

export function SecurityCard() {
  return <section className="surface-card settings-section"><div className="settings-heading"><span className="settings-icon icon-green"><LockClosedIcon /></span><div><h2>보안 상태</h2><p>현재 로그인 상태와 운영 데이터 보호 항목을 확인합니다.</p></div></div><ul className="security-list"><li><CheckCircledIcon /> 서명된 HTTP 전용 쿠키</li><li><CheckCircledIcon /> 데이터 변경 전 소유권 재확인</li><li><CheckCircledIcon /> 행동 이벤트에서 개인 식별 정보 제외</li><li><CheckCircledIcon /> 웹훅 HMAC 서명 확인</li></ul></section>;
}
