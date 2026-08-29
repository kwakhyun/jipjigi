"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { useAtom } from "jotai";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarIcon,
  CheckCircledIcon,
  ChevronDownIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  GearIcon,
  HomeIcon,
  InfoCircledIcon,
  PaperPlaneIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import type { DashboardSnapshot } from "@jipjigi/domain";
import { formatCompactWon, formatWon } from "@jipjigi/domain/format";
import type { BriefingVariant } from "@jipjigi/experiments";
import { useTransientMessage } from "@/lib/hooks/use-transient-message";
import { submitOperation } from "@/lib/operations/client";
import { selectedBuildingIdAtom } from "@/lib/state/workspace";
import { track } from "@/lib/analytics/client";

type BriefingResponse = {
  data: DashboardSnapshot;
  experiment: { key: string; variant: BriefingVariant };
};

type Building = { id: string; name: string; address: string; totalUnits: number; occupiedUnits: number };

async function getBriefing(buildingId: string): Promise<BriefingResponse> {
  const response = await fetch(`/api/mobile/v1/briefing?buildingId=${encodeURIComponent(buildingId)}`);
  if (!response.ok) throw new Error("브리핑을 불러오지 못했습니다.");
  return response.json() as Promise<BriefingResponse>;
}

export function DashboardView({ initial, buildings, userName }: { initial: BriefingResponse; buildings: Building[]; userName: string }) {
  const [selectedBuildingId, setSelectedBuildingId] = useAtom(selectedBuildingIdAtom);
  const [toast, showToast] = useTransientMessage();
  const queryClient = useQueryClient();
  const activeBuildingId = selectedBuildingId ?? initial.data.building.id;

  const briefing = useQuery({
    queryKey: ["briefing", activeBuildingId],
    queryFn: () => getBriefing(activeBuildingId),
    initialData: activeBuildingId === initial.data.building.id ? initial : undefined,
  });
  const value = briefing.data ?? initial;
  const exposedRisk = value.data.briefing.renewal
    ? { type: "lease_expiring", id: value.data.briefing.renewal.leaseId }
    : value.data.briefing.overdue
      ? { type: "payment_overdue", id: value.data.briefing.overdue.chargeId }
      : value.data.briefing.maintenance
        ? { type: "maintenance_urgent", id: value.data.briefing.maintenance.requestId }
        : null;

  useEffect(() => {
    const exposureKey = `jipjigi:exposure:${value.experiment.key}:${value.experiment.variant}`;
    try {
      if (window.sessionStorage.getItem(exposureKey)) return;
      window.sessionStorage.setItem(exposureKey, "1");
    } catch {
      // Exposure remains best-effort when browser storage is unavailable.
    }
    track("experiment_exposed", {
      experiment_key: value.experiment.key,
      variant: value.experiment.variant,
      risk_type: exposedRisk?.type ?? "none",
      risk_signal_id: exposedRisk?.id ?? "none",
    }, window.location.pathname, {
      experimentKey: value.experiment.key,
      variant: value.experiment.variant,
    });
  }, [exposedRisk?.id, exposedRisk?.type, value.experiment.key, value.experiment.variant]);

  const operation = useMutation({
    mutationFn: submitOperation,
    onSuccess: async (result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["briefing"] });
      const messageResult = "id" in result ? result : null;
      if (variables.type === "start_renewal") {
        showToast(messageResult?.status === "blocked" ? "발송 조건을 충족하지 못해 갱신 요청을 차단했어요." : messageResult?.duplicate ? "최근 24시간 안에 접수한 갱신 요청이 있어요." : "갱신 의사 확인 요청을 접수했어요.");
      } else if (variables.type === "send_overdue_notice") {
        showToast(messageResult?.status === "blocked" ? "발송 조건을 충족하지 못해 미납 안내를 차단했어요." : messageResult?.duplicate ? "이번 청구월의 미납 안내가 이미 접수돼 있어요." : "발송 제한을 확인하고 미납 안내를 접수했어요.");
      }
    },
    onError: (error) => showToast(error instanceof Error ? error.message : "작업을 처리하지 못했습니다."),
  });

  const snapshot = value.data;
  const greetingName = /^[가-힣]{3}$/.test(userName) ? userName.slice(1) : userName;
  const attentionItems = [snapshot.briefing.renewal, snapshot.briefing.overdue, snapshot.briefing.maintenance].filter((item) => item !== null);
  const affectedUnitCount = new Set(attentionItems.map((item) => item.unitName)).size;
  const renewalSection = snapshot.briefing.renewal ? (
    <RenewalPriority
      key="renewal"
      renewal={snapshot.briefing.renewal}
      pending={operation.isPending}
      onStart={() => operation.mutate({ type: "start_renewal", leaseId: snapshot.briefing.renewal?.leaseId ?? "" })}
      onEvidence={() => track("risk_evidence_opened", {
        lease_id: snapshot.briefing.renewal?.leaseId ?? "",
        risk_type: "lease_expiring",
        source: "home_priority",
      }, window.location.pathname, { experimentKey: value.experiment.key, variant: value.experiment.variant })}
    />
  ) : null;
  const agendaSection = (
    <Agenda
      key="agenda"
      overdue={snapshot.briefing.overdue}
      maintenance={snapshot.briefing.maintenance}
      pending={operation.isPending}
      onOverdue={() => operation.mutate({ type: "send_overdue_notice", chargeId: snapshot.briefing.overdue?.chargeId ?? "" })}
    />
  );
  const briefings: ReactNode[] = value.experiment.variant === "risk-first" ? [renewalSection, agendaSection] : [agendaSection, renewalSection];

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero" aria-labelledby="dashboard-title">
        <div className="dashboard-hero-overlay" />
        <div className="dashboard-hero-content">
          <div className="dashboard-hero-topline">
            <div>
              <span className="hero-date-label">{formatDashboardDate(snapshot.generatedAt)}</span>
              <h1 id="dashboard-title">{formatGreeting(snapshot.generatedAt)}, {greetingName}님</h1>
            </div>
            <label className="building-select-wrap">
              <HomeIcon width={17} height={17} aria-hidden="true" />
              <span className="sr-only">관리 건물 선택</span>
              <select
                value={activeBuildingId}
                onChange={(event) => {
                  setSelectedBuildingId(event.target.value);
                  track("briefing_opened", { building_id: event.target.value, source: "building_switcher" });
                }}
              >
                {buildings.map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}
              </select>
              <ChevronDownIcon width={15} height={15} aria-hidden="true" />
            </label>
          </div>
          <div className="hero-summary-copy">
            <span>오늘의 운영 브리핑</span>
            <strong>확인이 필요한 일 {attentionItems.length}건</strong>
            <p><CheckCircledIcon width={18} height={18} aria-hidden="true" /> 나머지 {Math.max(snapshot.building.occupiedUnits - affectedUnitCount, 0)}세대는 특이 사항 없이 운영 중이에요</p>
          </div>
        </div>
      </section>

      <section className="metric-strip" aria-label="이달 운영 지표">
        <Metric label="수납률" value={`${snapshot.metrics.collectionRate}%`} detail={`${formatCompactWon(snapshot.metrics.collectedAmount)} 수납`} tone="purple" />
        <Metric label="입주율" value={`${snapshot.metrics.occupiedRate}%`} detail={`${snapshot.building.occupiedUnits}/${snapshot.building.totalUnits}세대`} tone="green" />
        <Metric label="진행 중 수리" value={`${snapshot.metrics.openMaintenance}건`} detail="처리 상태 확인" tone="coral" />
      </section>

      <div className="dashboard-grid">
        <div className="briefing-column">
          {briefing.isFetching ? <div className="refresh-status" role="status"><ReloadIcon className="spin" /> 최신 상태 확인 중</div> : null}
          {briefings}
        </div>
        <aside className="activity-panel" aria-labelledby="activity-title">
          <div className="section-heading-row">
            <div><span className="section-kicker">실시간 기록</span><h2 id="activity-title">최근 활동</h2></div>
          </div>
          <ol className="activity-list">
            {snapshot.recentActivities.map((activity) => (
              <li key={activity.id}>
                <span className={`activity-dot tone-${activity.tone}`} />
                <div><strong>{activity.label}</strong><p>{activity.detail}</p><time dateTime={activity.occurredAt}>{formatActivityTime(activity.occurredAt)}</time></div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return <article className={`metric-item metric-${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function RenewalPriority({ renewal, pending, onStart, onEvidence }: { renewal: NonNullable<DashboardSnapshot["briefing"]["renewal"]>; pending: boolean; onStart: () => void; onEvidence: () => void }) {
  return (
    <section className="surface-card priority-card" aria-labelledby="priority-heading">
      <div className="section-heading-row">
        <div><span className="section-kicker kicker-coral">가장 먼저 확인하세요</span><h2 id="priority-heading">계약 만료가 가까워요</h2></div>
        <span className="risk-pill">D-{renewal.daysLeft}</span>
      </div>
      <div className="priority-content">
        <Image className="priority-asset" src="/assets/jipjigi/priority-renewal-icon.png" width={104} height={104} alt="계약 갱신 일정 알림" />
        <div className="priority-copy">
          <h3>{renewal.unitName} · {renewal.tenantName}님</h3>
          <p>현재 월세는 {formatCompactWon(renewal.currentRent)}입니다. 계약이 끝나기 전에 갱신 의사를 확인하면 공실 위험을 줄일 수 있어요.</p>
          <details className="evidence-details" onToggle={(event) => {
            if (event.currentTarget.open) onEvidence();
          }}>
            <summary>제안 근거와 조건 확인 <ChevronDownIcon /></summary>
            <div className="evidence-grid">
              <span>현재 보증금<strong>{formatWon(renewal.currentDeposit)}</strong></span>
              <span>현재 월세<strong>{formatWon(renewal.currentRent)}</strong></span>
              <span>주변 시세를 반영한 제안<strong>{formatWon(renewal.suggestedRent)}</strong></span>
            </div>
            <p><InfoCircledIcon /> 제안 금액은 참고용이며 임대인과 임차인의 합의가 우선입니다.</p>
          </details>
        </div>
      </div>
      <button className="button button-primary button-wide" type="button" onClick={onStart} disabled={pending || renewal.status === "requested"}>
        <PaperPlaneIcon /> {renewal.status === "requested" ? "확인 요청 접수 완료" : pending ? "발송 조건 확인 중…" : "갱신 의사 확인하기"}
      </button>
    </section>
  );
}

function Agenda({ overdue, maintenance, pending, onOverdue }: { overdue: DashboardSnapshot["briefing"]["overdue"]; maintenance: DashboardSnapshot["briefing"]["maintenance"]; pending: boolean; onOverdue: () => void }) {
  return (
    <section className="surface-card agenda-card" aria-labelledby="agenda-heading">
      <div className="section-heading-row"><div><span className="section-kicker">오늘 끝낼 일</span><h2 id="agenda-heading">운영 일정</h2></div><span className="count-badge">{[overdue, maintenance].filter(Boolean).length}</span></div>
      <div className="agenda-list">
        {overdue ? (
          <article className="agenda-item">
            <span className="agenda-icon icon-coral"><ExclamationTriangleIcon /></span>
            <div><span className="agenda-time">납부일 {overdue.daysOverdue}일 지남</span><h3>{overdue.unitName} 월세 미납</h3><p>{overdue.tenantName}님, {formatWon(overdue.amount)}</p></div>
            <button className="button button-secondary button-small" type="button" disabled={pending || overdue.noticeStatus !== "not_sent"} onClick={onOverdue}>{overdue.noticeStatus === "not_sent" ? "안내 보내기" : "접수 완료"}</button>
          </article>
        ) : <div className="empty-inline"><CheckCircledIcon /> 연체된 임대료가 없어요.</div>}
        {maintenance ? (
          <article className="agenda-item">
            <span className="agenda-icon icon-purple"><GearIcon /></span>
            <div><span className="agenda-time">오늘 접수</span><h3>{maintenance.unitName} 수리 요청</h3><p>{maintenance.title}</p></div>
            <Link className="button button-secondary button-small" href={`/app/maintenance?schedule=${encodeURIComponent(maintenance.requestId)}#schedule-${encodeURIComponent(maintenance.requestId)}`}>{maintenance.status === "received" ? "일정 정하기" : "일정 확인"}</Link>
          </article>
        ) : <div className="empty-inline"><CheckCircledIcon /> 처리 중인 수리 요청이 없어요.</div>}
      </div>
      <div className="guardrail-line"><ClockIcon /><span>오후 9시부터 오전 8시까지는 메시지를 보내지 않고 다음 발송 가능 시간으로 예약해요.</span></div>
    </section>
  );
}

function formatActivityTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function formatDashboardDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatGreeting(value: string) {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: "Asia/Seoul",
  }).format(new Date(value)));
  if (hour >= 5 && hour < 12) return "좋은 아침이에요";
  if (hour >= 12 && hour < 18) return "좋은 오후예요";
  if (hour >= 18 && hour < 23) return "좋은 저녁이에요";
  return "늦은 시간에도 반가워요";
}
