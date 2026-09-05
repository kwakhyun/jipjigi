import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircledIcon } from "@radix-ui/react-icons";
import { BrandLockup } from "@/components/brand-lockup";
import { SessionActions } from "@/components/session-actions";
import { getOptionalSession } from "@/lib/auth/dal";
import { roleHome, roleLabels } from "@/lib/auth/navigation";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; mode?: string | string[] }> }) {
  const [query, session] = await Promise.all([searchParams, getOptionalSession()]);
  const demoEnabled = process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_AUTH === "true";
  if (session && !demoEnabled) redirect(roleHome(session.role));
  const initialMode = query.mode === "operator" ? "operator" : "owner";
  const nextPath = typeof query.next === "string" ? query.next : roleHome(initialMode);
  return (
    <main className="login-page">
      <section className="login-story" aria-label="집지기 소개">
        <Link href="/" className="login-brand">
          <BrandLockup tone="dark" />
        </Link>
        <div className="login-story-copy">
          <span className="eyebrow eyebrow-on-dark">임대인의 건물을 매일 챙기는 집지기</span>
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
          {demoEnabled ? <span className="demo-badge">데모 계정</span> : null}
          <h2 id="login-title">다시 만나서 반가워요</h2>
          <p>{demoEnabled ? "확인할 데모를 선택해 서로 다른 업무 화면을 둘러보세요." : "계정 정보로 로그인해 주세요."}</p>
          {session ? <section className="login-current-session" aria-label="현재 로그인 상태">
            <strong>현재 {roleLabels[session.role]} 계정으로 로그인되어 있어요.</strong>
            <p>다른 데모로 로그인하면 계정이 전환됩니다.</p>
            <div><Link className="text-link" href={roleHome(session.role)}>현재 화면으로 돌아가기</Link><SessionActions role={session.role} /></div>
          </section> : null}
          <LoginForm key={`${initialMode}:${nextPath}`} nextPath={nextPath} demoEnabled={demoEnabled} initialMode={initialMode} />
          {demoEnabled ? <div className="demo-credentials" aria-label="데모 로그인 정보">
            <span>임대인 <strong>demo@jipjigi.kr</strong></span>
            <span>그로스 운영자 <strong>growth@jipjigi.kr</strong></span>
            <span>공통 비밀번호 <strong>demo1234!</strong></span>
          </div> : null}
        </div>
      </section>
    </main>
  );
}
