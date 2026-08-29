import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, CheckCircledIcon, ClockIcon, FileTextIcon, PaperPlaneIcon, ReaderIcon } from "@radix-ui/react-icons";
import { BrandLockup } from "@/components/brand-lockup";
import { MarketingHeader } from "@/components/marketing-header";
import { TrackedLink } from "@/components/tracked-link";

export default function MarketingPage() {
  return (
    <main className="marketing-page">
      <MarketingHeader />
      <section className="marketing-hero">
        <div className="marketing-hero-copy">
          <span className="eyebrow">임대인의 건물을 매일 챙기는 집지기</span>
          <h1><span>월세부터 민원까지,</span><br /><strong>집지기가 먼저 챙겨요.</strong></h1>
          <p>월세, 계약 만료, 수리 요청을 한눈에 확인하고 임차인 연락부터 결과 측정까지 한 흐름에서 처리합니다.</p>
          <div className="marketing-actions"><TrackedLink className="button button-primary button-large" href="/login?mode=owner" source="marketing_hero">운영 데모 열기 <ArrowRightIcon /></TrackedLink><Link className="text-link" href="/#capabilities">핵심 기능 보기</Link></div>
          <div className="marketing-proof"><span><CheckCircledIcon /> 안전한 데이터 보관</span><span><CheckCircledIcon /> 발송 전 안전 점검</span><span><CheckCircledIcon /> 성과 측정</span></div>
        </div>
        <div className="marketing-visual" aria-label="집지기 오늘의 브리핑 미리보기">
          <Image src="/assets/jipjigi/hero-night-building.jpg" fill sizes="(max-width: 900px) 92vw, 48vw" alt="야간 도심 건물 전경" priority />
          <div className="marketing-preview-card">
            <span>오늘의 운영 브리핑</span><strong>확인이 필요한 일 3건</strong>
            <div><i className="preview-icon preview-coral"><ClockIcon /></i><p><b>501호 계약 만료</b><small>한 달 이내, 먼저 확인하세요</small></p><em>임박</em></div>
            <div><i className="preview-icon preview-purple"><PaperPlaneIcon /></i><p><b>203호 월세 미납</b><small>동의와 발송 시간 확인</small></p><em>조치</em></div>
          </div>
        </div>
      </section>
      <section className="marketing-operating-loop" id="capabilities">
        <div className="marketing-section-heading"><span className="section-kicker" aria-hidden="true">하나의 운영 흐름</span><h2>발견부터 결과 확인까지, 하나의 흐름으로</h2><p>기능을 나열하는 대신 임대인의 실제 업무 순서에 맞춰 연결했습니다.</p></div>
        <div className="capability-grid">
          <article><span className="capability-number">01</span><i><ReaderIcon /></i><h3>위험 브리핑</h3><p>연체, 갱신, 수리 중 지금 가장 중요한 일을 근거와 함께 정렬합니다.</p></article>
          <article><span className="capability-number">02</span><i><FileTextIcon /></i><h3>바로 조치하는 임대 장부</h3><p>상태를 보는 데서 끝나지 않고 입금 확인과 미납 안내를 바로 처리합니다.</p></article>
          <article><span className="capability-number">03</span><i><PaperPlaneIcon /></i><h3>안전한 메시지 발송</h3><p>수신 동의, 발송 횟수, 제한 시간을 확인한 뒤 메시지를 보내거나 예약합니다.</p></article>
        </div>
      </section>
      <section className="marketing-growth-section">
        <div><span className="section-kicker" aria-hidden="true">측정 가능한 설계</span><h2>잘 작동하는지 설명할 수 있는 제품</h2><p>사용자별 실험안, 실제 노출, 핵심 조치, 발송 제한 결과를 같은 기준으로 기록합니다. 행동 이벤트에는 이름과 연락처를 저장하지 않습니다.</p><TrackedLink className="button button-dark" href="/login?mode=operator&next=/app/growth" source="marketing_growth">그로스 데모 보기 <ArrowRightIcon /></TrackedLink></div>
        <div className="growth-demo-card"><span className="live-badge"><span /> LIVE</span><h3>홈 브리핑 우선순위</h3><div><span>위험 우선안</span><strong>50%</strong></div><div><span>일정 우선안</span><strong>50%</strong></div><small>사용자별로 같은 실험안 유지</small></div>
      </section>
      <footer className="marketing-footer"><BrandLockup /><p>임대 운영의 불확실성을 오늘의 명확한 조치로 바꿉니다.</p><Link href="/login">데모 로그인</Link></footer>
    </main>
  );
}
