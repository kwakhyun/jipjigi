"use client";

import { useFormStatus } from "react-dom";
import { ExitIcon, UpdateIcon } from "@radix-ui/react-icons";
import { logoutAction } from "@/app/login/actions";
import { demoLabels, type UserRole } from "@/lib/auth/navigation";

export function SessionActions({ role, demoEnabled = false }: { role: UserRole; demoEnabled?: boolean }) {
  return (
    <form action={logoutAction} className="session-actions" aria-label="계정 전환">
      <SessionButtons role={role} demoEnabled={demoEnabled} />
    </form>
  );
}

function SessionButtons({ role, demoEnabled }: { role: UserRole; demoEnabled: boolean }) {
  const { pending, data } = useFormStatus();
  const otherRole = role === "owner" ? "operator" : "owner";
  return <>
    {demoEnabled ? <button className="button button-secondary button-small" type="submit" name="mode" value={otherRole} disabled={pending} title="현재 계정에서 로그아웃한 뒤 다른 데모의 로그인 화면을 엽니다.">
      <UpdateIcon aria-hidden="true" />{pending && data?.get("mode") ? "전환하는 중…" : `${demoLabels[otherRole]}로 전환`}
    </button> : null}
    <button className="button button-quiet button-small" type="submit" disabled={pending}>
      <ExitIcon aria-hidden="true" />{pending && !data?.get("mode") ? "로그아웃하는 중…" : "로그아웃"}
    </button>
  </>;
}
