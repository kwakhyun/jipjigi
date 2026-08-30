"use client";

import { useState, useTransition, type FormEvent } from "react";
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

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const next = {
      ...value,
      quietHoursStart: String(formData.get("quietHoursStart") ?? ""),
      quietHoursEnd: String(formData.get("quietHoursEnd") ?? ""),
    };
    startTransition(async () => {
      const result = await savePreferencesAction(next);
      showStatus(result.ok ? "변경 사항을 저장했어요." : result.error);
    });
  };

  return (
    <form className="surface-card settings-section" aria-labelledby="notification-title" onSubmit={save}>
      <div className="settings-heading"><span className="settings-icon"><ClockIcon /></span><div><h2 id="notification-title">알림 및 발송 설정</h2><p>운영 알림과 임차인 메시지 발송 기준을 설정합니다.</p></div></div>
      <div className="toggle-list">
        <Toggle label="임대료 미납 감지" description="홈에 미납 조치 카드를 표시합니다. 꺼도 장부에서는 확인할 수 있습니다." checked={value.rentReminder} onChange={(checked) => setValue((current) => ({ ...current, rentReminder: checked }))} />
        <Toggle label="계약 갱신 알림" description="갱신 확인 대상 중 만료 60일 이내 계약을 홈에 표시합니다." checked={value.renewalReminder} onChange={(checked) => setValue((current) => ({ ...current, renewalReminder: checked }))} />
        <Toggle label="수리 상태 알림" description="홈에 처리 중인 수리 일정을 표시합니다. 꺼도 수리 목록은 유지됩니다." checked={value.maintenanceUpdates} onChange={(checked) => setValue((current) => ({ ...current, maintenanceUpdates: checked }))} />
        <Toggle label="제품 소식과 혜택" description="수신 동의만 저장합니다. 데모에서는 마케팅 알림을 발송하지 않습니다." checked={value.marketing} onChange={(checked) => setValue((current) => ({ ...current, marketing: checked }))} />
      </div>
      <div className="quiet-hours-form">
        <div><strong>발송 제한 시간</strong><p>이 시간의 요청은 예약 상태와 다음 발송 가능 시각으로 저장합니다. 데모에서는 자동 발송하지 않습니다.</p></div>
        <label><span>시작</span><input type="time" name="quietHoursStart" defaultValue={initial.quietHoursStart} required /></label>
        <span aria-hidden="true">~</span>
        <label><span>종료</span><input type="time" name="quietHoursEnd" defaultValue={initial.quietHoursEnd} required /></label>
      </div>
      <div className="settings-save-row">
        <span role="status">{status ? <>{status === "변경 사항을 저장했어요." ? <CheckCircledIcon /> : null} {status}</> : null}</span>
        <button className="button button-primary" type="submit" disabled={isPending}>{isPending ? "저장 중…" : "변경 사항 저장"}</button>
      </div>
    </form>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="toggle-row"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="toggle-control" aria-hidden="true" /></label>;
}

export function SecurityCard() {
  return <section className="surface-card settings-section"><div className="settings-heading"><span className="settings-icon icon-green"><LockClosedIcon /></span><div><h2>보안 상태</h2><p>현재 로그인 상태와 운영 데이터 보호 항목을 확인합니다.</p></div></div><ul className="security-list"><li><CheckCircledIcon /> 서명된 HTTP 전용 쿠키</li><li><CheckCircledIcon /> 데이터 변경 전 소유권 재확인</li><li><CheckCircledIcon /> 행동 이벤트에서 개인 식별 정보 제외</li><li><CheckCircledIcon /> 웹훅 HMAC 서명 확인</li></ul></section>;
}
