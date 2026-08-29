"use client";

import { ReloadIcon } from "@radix-ui/react-icons";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="workspace-route-state" role="alert">
      <span className="state-symbol" aria-hidden="true">!</span>
      <h1>운영 정보를 불러오지 못했어요</h1>
      <p>저장된 내용은 그대로입니다. 잠시 뒤 다시 시도해 주세요.</p>
      <button className="button button-primary" type="button" onClick={reset}>
        <ReloadIcon aria-hidden="true" /> 다시 시도
      </button>
    </section>
  );
}
