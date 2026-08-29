"use client";

import { ReloadIcon } from "@radix-ui/react-icons";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="route-state"><span className="state-symbol">!</span><h1>화면을 불러오지 못했어요</h1><p>저장한 내용은 그대로예요. 다시 시도해 주세요.</p><button className="button button-primary" type="button" onClick={reset}><ReloadIcon /> 다시 시도</button></main>;
}
