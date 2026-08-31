"use client";

import { useActionState } from "react";
import { restartDemoAction, type DemoRestartState } from "@/app/app/demo-actions";
import type { BriefingVariant } from "@jipjigi/experiments";

const initialState: DemoRestartState = {};

export function DemoControls({ variant }: { variant: BriefingVariant }) {
  const [state, action, pending] = useActionState(restartDemoAction, initialState);
  return <section className="surface-card settings-section demo-controls" id="demo-reset" aria-labelledby="demo-controls-title">
    <h2 id="demo-controls-title">개인 데모 관리</h2>
    <div className="demo-controls-panel">
      <p>이 브라우저만의 체험 공간입니다. 두 데모에서 같은 작업 결과를 확인할 수 있으며, 생성 후 최대 12시간 동안 유지됩니다.</p>
      <form action={action}>
        <label className="field-label" htmlFor="demo-variant">체험할 홈 구성</label>
        <select id="demo-variant" name="variant" defaultValue={variant} disabled={pending}>
          <option value="risk-first">계약 만료 먼저 보기</option>
          <option value="agenda-first">오늘 일정 먼저 보기</option>
        </select>
        <label className="demo-reset-consent"><input type="checkbox" name="confirm" value="yes" required disabled={pending} /> 현재 체험 기록을 지우고 새로 시작합니다.</label>
        <p className="demo-controls-note">다른 방문자의 데이터는 바뀌지 않습니다. 이전 기록은 복구할 수 없으며, 새 공간의 실험 로그와 섞이지 않습니다.</p>
        {state.error ? <p role="alert" className="form-error">{state.error}</p> : null}
        <button className="button button-secondary button-small" type="submit" disabled={pending}>{pending ? "새 체험 준비 중…" : "선택한 구성으로 새로 시작"}</button>
      </form>
    </div>
  </section>;
}
