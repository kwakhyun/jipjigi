import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircledIcon } from "@radix-ui/react-icons";
import { getOptionalSession } from "@/lib/auth/dal";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; mode?: string }> }) {
  const [query, session] = await Promise.all([searchParams, getOptionalSession()]);
  if (session) redirect(session.role === "operator" ? "/app/growth" : "/app");
  const demoEnabled = process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_AUTH === "true";
  const initialMode = query.mode === "operator" ? "operator" : "owner";
  return (
    <main className="login-page">
      <section className="login-story" aria-label="렌트플로우 소개">
        <Link href="/" className="login-brand">
          <Image src="/assets/rentflow/brand-lockup-on-dark.png" width={118} height={38} alt="렌트플로우" priority />
        </Link>
        <div className="login-story-copy">
          <span className="eyebrow eyebrow-on-dark">놓치기 전에 움직이는 임대 관리</span>
          <h1>오늘 처리해야 할 일만<br />선명하게 보여드려요.</h1>
          <p>흩어진 월세, 계약, 수리 요청 기록을 한 번에 처리하는 운영 흐름으로 바꿉니다.</p>
          <ul className="login-benefits">
            <li><CheckCircledIcon /> 임대료 수납과 연체 조치</li>
            <li><CheckCircledIcon /> 계약 만료 위험과 갱신 협의</li>
            <li><CheckCircledIcon /> 수신 동의와 발송 시간 자동 점검</li>
          </ul>
        </div>
      </section>
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-card">
          {demoEnabled ? <span className="demo-badge">포트폴리오 데모 계정</span> : null}
          <h2 id="login-title">다시 만나서 반가워요</h2>
          <p>준비된 데모 계정으로 실제 운영 흐름을 둘러보세요.</p>
          <LoginForm nextPath={query.next ?? (initialMode === "operator" ? "/app/growth" : "/app")} demoEnabled={demoEnabled} initialMode={initialMode} />
          {demoEnabled ? <div className="demo-credentials" aria-label="데모 로그인 정보">
            <span>임대인 <strong>demo@rentflow.kr</strong></span>
            <span>운영자 <strong>growth@rentflow.kr</strong></span>
            <span>공통 비밀번호 <strong>demo1234!</strong></span>
          </div> : null}
        </div>
      </section>
    </main>
  );
}
