"use client";

import { ReloadIcon } from "@radix-ui/react-icons";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body>
        <main className="route-state">
          <span className="state-symbol">!</span>
          <h1>서비스를 불러오지 못했어요</h1>
          <p>잠시 후 다시 시도해 주세요.</p>
          <button className="button button-primary" type="button" onClick={reset}><ReloadIcon /> 다시 시도</button>
        </main>
      </body>
    </html>
  );
}
