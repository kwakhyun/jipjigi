import type { Metadata } from "next";
import { BarChartIcon, CheckCircledIcon, ExclamationTriangleIcon, EyeOpenIcon, LapTimerIcon, PaperPlaneIcon, TargetIcon } from "@radix-ui/react-icons";
import { PageHeader } from "@/components/page-header";
import { requireOperator } from "@/lib/auth/dal";
import { getGrowthOverview, getWebVitalsOverview } from "@/lib/data/repository";
import type { CoreWebVitalName } from "@/lib/performance/schema";

export const metadata: Metadata = { title: "그로스 관제" };
export const dynamic = "force-dynamic";

const eventLabels: Record<string, string> = {
  page_viewed: "화면 조회",
  experiment_exposed: "실험 노출",
  briefing_opened: "브리핑 탐색",
  risk_evidence_opened: "위험 근거 확인",
  renewal_started: "갱신 조치",
  overdue_notice_requested: "미납 안내",
  payment_marked: "입금 확인",
  maintenance_updated: "수리 상태 변경",
  notification_preferences_updated: "알림 설정 변경",
  crm_message_requested: "메시지 접수",
  crm_guardrail_blocked: "발송 조건 차단",
  crm_message_delivery_updated: "메시지 전달 결과",
  crm_message_retry_requested: "메시지 재접수",
  crm_opted_out: "채널 수신 해제",
  renewal_response_recorded: "갱신 응답",
};

export default async function GrowthPage() {
  const user = await requireOperator();
  const workspace = user.demoWorkspace;
  const [overview, webVitals] = await Promise.all([
    getGrowthOverview(workspace?.ownerId),
    getWebVitalsOverview(workspace ? [workspace.ownerId, workspace.operatorId] : undefined),
  ]);
  const eventMap = new Map(overview.eventCounts.map((item) => [item.name, item.count]));
  const views = eventMap.get("page_viewed") ?? 0;
  const actions = ["renewal_started", "overdue_notice_requested", "payment_marked", "maintenance_updated"].reduce((sum, key) => sum + (eventMap.get(key) ?? 0), 0);
  const messages = overview.messageStats.reduce((sum, item) => sum + item.count, 0);
  const blocked = overview.messageStats.find((item) => item.status === "blocked")?.count ?? 0;
  const maxEvent = Math.max(...overview.eventCounts.map((item) => item.count), 1);
  const assignedUsers = overview.assignmentCounts.reduce((sum, item) => sum + item.count, 0);
  const riskFirstUsers = overview.assignmentCounts.find((item) => item.variant === "risk-first")?.count ?? 0;
  const experimentResult = (variant: "risk-first" | "agenda-first") => overview.experimentResults.find((item) => item.variant === variant);

  return (
    <div className="standard-page growth-page">
      <PageHeader eyebrow="운영자 도구" title="그로스 관제" description="화면 출시에서 끝내지 않고 노출, 조치, 안전 지표까지 측정합니다." action={<span className="live-badge"><span /> {workspace ? "현재 체험 공간의 데이터" : "최근 7일 수집 데이터"}</span>} />
      {workspace ? <p className="demo-measurement-note">임대인 데모에서 수행한 행동만 집계합니다. 두 계정은 한 체험 공간을 공유하며, 이 수치는 실제 고객의 실험 성과가 아닙니다. 새로운 행동은 이 화면을 다시 열면 반영됩니다.</p> : null}
      <section className="growth-kpi-grid" aria-label="핵심 제품 지표">
        <GrowthKpi icon={<EyeOpenIcon />} label="화면 조회" value={views} detail="로그인 사용자 기준" />
        <GrowthKpi icon={<TargetIcon />} label="운영 조치" value={actions} detail={views ? `조회 대비 ${Math.round((actions / views) * 100)}%` : "아직 실행된 조치 없음"} />
        <GrowthKpi icon={<PaperPlaneIcon />} label="메시지 요청" value={messages} detail="접수, 예약, 차단 포함" />
        <GrowthKpi icon={<ExclamationTriangleIcon />} label="발송 차단" value={blocked} detail="수신 동의와 발송 횟수 제한" />
      </section>
      <section className="surface-card crm-guardrail-card" aria-labelledby="crm-guardrail-title">
        <div className="data-section-header"><div><span className="section-kicker" aria-hidden="true">CRM 안전 지표</span><h2 id="crm-guardrail-title">전달 성과와 사용자 통제권</h2><p>메시지 성과는 전달률뿐 아니라 수신 해제율과 차단률을 함께 판단합니다.</p></div></div>
        <div className="crm-guardrail-grid">
          <GrowthRate label="전달률" value={formatRate(overview.crmGuardrails.deliveryRate)} detail="공급자 전달 완료 / 전달 시도" />
          <GrowthRate label="전달 후 수신 해제율" value={formatRate(overview.crmGuardrails.optOutRate)} detail={`${overview.crmGuardrails.optOuts}건 해제 / ${overview.crmGuardrails.deliveredRecipients}건 전달 계약`} />
          <GrowthRate label="발송 차단률" value={formatRate(overview.crmGuardrails.blockedRate)} detail="수신 동의와 발송 횟수 제한" />
        </div>
        <p className="rum-footnote">최근 7일에 전달된 계약 중 같은 채널에서 전달 이후 7일 이내 수신 해제한 계약의 비율입니다. 관찰 기간이 끝나지 않은 계약도 포함하는 잠정 지표이며 사람 수를 뜻하지 않습니다.</p>
      </section>
      <section className="surface-card rum-card" aria-labelledby="rum-title">
        <div className="data-section-header">
          <div><span className="section-kicker" aria-hidden="true">브라우저 성능</span><h2 id="rum-title">사용자 체감 성능</h2><p>{workspace ? "현재 체험 공간에서 수집한 Core Web Vitals의 p75입니다. 외부 사용자 전체의 성능을 뜻하지 않습니다." : "브라우저에서 수집한 최근 7일 Core Web Vitals의 p75입니다."}</p></div>
          <span className="rum-sample-count">{webVitals.sampleCount.toLocaleString("ko-KR")}개 표본, {webVitals.routeCount}개 경로</span>
        </div>
        <div className="rum-metric-grid">
          {webVitals.metrics.map((metric) => {
            const passing = metric.p75 !== null && metric.p75 <= metric.target;
            return (
              <article key={metric.name}>
                <span className="rum-metric-icon"><LapTimerIcon aria-hidden="true" /></span>
                <div><span>{metric.name} p75</span><strong>{formatWebVital(metric.name, metric.p75)}</strong><small>목표 {formatWebVital(metric.name, metric.target)}</small></div>
                <span className={passing ? "rum-status is-good" : "rum-status"}>{metric.p75 === null ? "수집 대기" : passing ? "목표 충족" : "개선 필요"}</span>
                <div className="rum-progress"><span style={{ width: `${metric.goodRate ?? 0}%` }} /><small>양호 비율 {metric.goodRate === null ? "-" : `${metric.goodRate}%`}</small></div>
              </article>
            );
          })}
        </div>
        <p className="rum-footnote">표본이 쌓이면 화면별 성능 저하를 확인합니다. CI에서는 번들 크기 기준으로 배포 전 성능 저하를 막고, 이 지표로 실제 기기와 네트워크의 결과를 검증합니다.</p>
      </section>
      <div className="growth-main-grid">
        <section className="surface-card experiment-card" aria-labelledby="experiment-title">
          <div className="data-section-header"><div><span className="section-kicker" aria-hidden="true">실험</span><h2 id="experiment-title">홈 브리핑 우선순위</h2><p>확인이 시급한 항목을 먼저 보여줄 때 조치율이 높아지는지 검증합니다.</p></div><span className="experiment-active"><span /> {workspace ? "배정과 집계 체험" : "진행 중"}</span></div>
          <div className="experiment-definition">
            <div><span>배정 현황</span><strong>{assignedUsers ? `위험 우선 ${Math.round((riskFirstUsers / assignedUsers) * 100)}%` : "배정 대기"}</strong><small>총 {assignedUsers.toLocaleString("ko-KR")}명 배정</small></div>
            {(["risk-first", "agenda-first"] as const).map((variant) => {
              const result = experimentResult(variant);
              const rate = result?.exposedUsers ? Math.round((result.actionUsers / result.exposedUsers) * 1000) / 10 : null;
              return <div key={variant}><span>{variant === "risk-first" ? "위험 우선안" : "일정 우선안"}</span><strong>{formatRate(rate)}</strong><small>{result?.actionUsers ?? 0}명 조치 / {result?.exposedUsers ?? 0}명 노출</small></div>;
            })}
            <div><span>안전 지표</span><strong>발송 차단률</strong><small>수신 동의, 발송 횟수, 제한 시간</small></div>
          </div>
          <div className="experiment-principle"><CheckCircledIcon /><p><strong>노출 이벤트를 먼저 기록합니다.</strong> 실험안을 배정받았지만 실제 화면을 보지 않은 사용자는 분모에서 제외해 결과가 흐려지는 것을 막습니다.</p></div>
        </section>
        <section className="surface-card event-chart-card" aria-labelledby="event-chart-title">
          <div className="data-section-header"><div><span className="section-kicker" aria-hidden="true">행동 로그</span><h2 id="event-chart-title">행동 이벤트</h2><p>허용 목록에 정의된 속성만 저장합니다.</p></div><BarChartIcon /></div>
          <div className="bar-chart">
            {overview.eventCounts.length ? overview.eventCounts.map((item) => <div className="bar-row" key={item.name}><span>{eventLabels[item.name] ?? item.name}</span><div><i style={{ width: `${Math.max(7, (item.count / maxEvent) * 100)}%` }} /></div><strong>{item.count}</strong></div>) : <div className="empty-state"><BarChartIcon /><strong>아직 수집된 이벤트가 없어요.</strong><span>다른 화면을 둘러보면 바로 누적됩니다.</span></div>}
          </div>
        </section>
      </div>
      <section className="surface-card event-stream" aria-labelledby="event-stream-title">
        <div className="data-section-header"><div><h2 id="event-stream-title">최근 이벤트 내역</h2><p>문제 확인에 필요한 최소한의 정보만 표시합니다.</p></div><span className="count-badge">{overview.recentEvents.length}</span></div>
        <div className="event-stream-list">
          {overview.recentEvents.map((event) => {
            const properties = parseEventProperties(event.propertiesJson);
            const context = [`릴리스 ${event.releaseVersion}`, event.experimentKey && event.variant ? `${propertyValue(event.variant)} 실험` : null, `${event.userSegment} 세그먼트`].filter(Boolean).join(" · ");
            return <article key={event.id}><span className="event-icon"><TargetIcon /></span><div><strong>{eventLabels[event.name] ?? event.name}</strong><p>{event.path} · {context}</p><small>{Object.entries(properties).map(([key, value]) => `${propertyLabel(key)}: ${propertyValue(String(value))}`).join(", ") || "추가 속성 없음"}</small></div><time dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time></article>;
          })}
          {!overview.recentEvents.length ? <div className="empty-state"><CheckCircledIcon /><strong>이벤트 수집 준비가 끝났어요.</strong><span>새 행동은 이 화면을 다시 열면 표시됩니다.</span></div> : null}
        </div>
      </section>
    </div>
  );
}

function formatWebVital(name: CoreWebVitalName, value: number | null) {
  if (value === null) return "-";
  return name === "CLS" ? value.toFixed(3) : `${Math.round(value).toLocaleString("ko-KR")}ms`;
}

function GrowthKpi({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: number; detail: string }) {
  return <article className="growth-kpi"><span className="growth-kpi-icon">{icon}</span><div><span>{label}</span><strong>{value.toLocaleString("ko-KR")}</strong><small>{detail}</small></div></article>;
}

function GrowthRate({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function formatRate(value: number | null) {
  return value === null ? "수집 대기" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
}

function propertyLabel(key: string) {
  return ({ experiment_key: "실험 키", variant: "실험안", source: "유입 위치", outcome: "처리 결과", risk_type: "위험 유형", provider_status: "전달 결과", retry_count: "재접수 횟수", response: "임차인 응답", billing_period: "청구월" } as Record<string, string>)[key] ?? key;
}

function propertyValue(value: string) {
  if (value === "risk-first") return "위험 우선안";
  if (value === "agenda-first") return "일정 우선안";
  return value;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function parseEventProperties(value: string): Record<string, string | number | boolean> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, string | number | boolean>
      : {};
  } catch {
    return {};
  }
}
