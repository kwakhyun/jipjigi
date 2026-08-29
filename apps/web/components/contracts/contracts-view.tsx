"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarIcon, CheckCircledIcon, InfoCircledIcon, PaperPlaneIcon } from "@radix-ui/react-icons";
import { formatWon } from "@jipjigi/domain/format";
import type { ContractRow, ContractTimelineEvent } from "@/lib/data/repository";
import { daysUntilDate } from "@/lib/format/date";
import { useTransientMessage } from "@/lib/hooks/use-transient-message";
import { submitOperation } from "@/lib/operations/client";

export function ContractsView({ initialContracts, referenceTime }: { initialContracts: ContractRow[]; referenceTime: string }) {
  const [contracts, setContracts] = useState(initialContracts);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [toast, showToast] = useTransientMessage();
  const visible = useMemo(() => contracts.filter((contract) => `${contract.unitName}${contract.tenantName}${contract.buildingName}`.includes(query.trim())), [contracts, query]);
  const attentionCount = contracts.filter((contract) => ["attention", "requested"].includes(contract.renewalStatus)).length;
  const closestEndDate = contracts.reduce<string | undefined>(
    (closest, contract) => !closest || contract.endDate < closest ? contract.endDate : closest,
    undefined,
  );

  const send = (contract: ContractRow) => {
    setPendingId(contract.id);
    startTransition(async () => {
      try {
        const result = await submitOperation({ type: "start_renewal", leaseId: contract.id });
        if (!("id" in result)) throw new Error("갱신 요청 결과를 확인하지 못했습니다.");
        setContracts((current) => current.map((item) => item.id === contract.id ? {
          ...item,
          renewalStatus: result.status === "blocked" ? item.renewalStatus : "requested",
          timeline: result.duplicate ? item.timeline : [{
            id: result.id,
            kind: "message" as const,
            status: result.status,
            occurredAt: new Date().toISOString(),
            retryCount: result.retryCount,
          }, ...item.timeline],
        } : item));
        showToast(result.status === "blocked" ? "발송 조건을 충족하지 못해 요청을 차단했어요." : result.duplicate ? "최근 24시간 안에 접수한 요청이 있어 기존 기록을 보여드려요." : `${contract.unitName} 임차인에게 갱신 의사 확인을 요청했어요.`);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
      } finally {
        setPendingId(null);
      }
    });
  };

  return (
    <>
      <section className="contract-overview surface-card">
        <div><span className="section-kicker kicker-coral">선제 대응</span><h2>{attentionCount}건의 계약을 먼저 확인하세요</h2><p>계약 만료 60일 전부터 갱신 의사를 확인하면 공실 기간과 급한 협상을 줄일 수 있어요.</p></div>
        <div className="contract-overview-stat"><CalendarIcon /><span>가장 가까운 만료<strong>D-{daysUntilDate(closestEndDate, referenceTime)}</strong></span></div>
      </section>
      <section className="surface-card data-section">
        <div className="data-section-header">
          <div><h2>진행 중 계약</h2><p>민감한 연락처는 마스킹된 상태로 표시됩니다.</p></div>
          <label className="search-field"><span className="sr-only">호실 또는 임차인 검색</span><input type="search" placeholder="호실, 임차인 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        </div>
        <div className="contract-list">
          {visible.map((contract) => (
            <article key={contract.id} className={`contract-row ${contract.renewalStatus === "attention" ? "needs-attention" : ""}`}>
              <div className="contract-identity"><span className="unit-avatar">{contract.unitName.replace("호", "")}</span><div><strong>{contract.unitName} · {contract.tenantName}</strong><small>{contract.buildingName} · {contract.tenantPhoneMasked}</small></div></div>
              <div className="contract-terms"><span>계약 기간<strong>{formatRange(contract.startDate, contract.endDate)}</strong></span><span>보증금 / 월세<strong>{formatWon(contract.depositAmount)} / {formatWon(contract.monthlyRent)}</strong></span></div>
              <div className="contract-action">
                <RenewalStatus status={contract.renewalStatus} />
                {contract.renewalStatus === "attention" ? <button className="button button-primary button-small" type="button" onClick={() => send(contract)} disabled={isPending}><PaperPlaneIcon /> {pendingId === contract.id ? "확인 중…" : "갱신 의사 확인"}</button> : null}
              </div>
              {contract.timeline.length ? <ContractTimeline events={contract.timeline} /> : null}
            </article>
          ))}
        </div>
        <div className="privacy-note"><InfoCircledIcon /><span>계약 정보는 건물 소유 여부를 확인한 뒤 표시합니다. 행동 기록에는 이름과 연락처를 남기지 않습니다.</span></div>
      </section>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </>
  );
}

function ContractTimeline({ events }: { events: ContractTimelineEvent[] }) {
  return (
    <details className="contract-timeline">
      <summary>갱신 연락 기록 {events.length}건</summary>
      <ol>
        {events.map((event) => <li key={event.id}><span>{timelineLabel(event)}</span><time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time></li>)}
      </ol>
    </details>
  );
}

function timelineLabel(event: ContractTimelineEvent) {
  const labels: Record<ContractTimelineEvent["status"], string> = {
    scheduled: "발송 가능 시간으로 예약",
    accepted: event.retryCount ? `${event.retryCount}차 재접수` : "갱신 의사 확인 접수",
    delivered: "임차인에게 전달",
    blocked: "발송 조건에 따라 차단",
    failed: "채널 전달 실패",
    agreed: "임차인이 갱신 의사 전달",
    declined: "임차인이 종료 의사 전달",
  };
  return labels[event.status];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function RenewalStatus({ status }: { status: ContractRow["renewalStatus"] }) {
  const map = {
    none: ["안정", "status-paid"],
    attention: ["확인 필요", "status-overdue"],
    requested: ["응답 대기", "status-upcoming"],
    agreed: ["갱신 합의", "status-paid"],
    ended: ["종료", "status-muted"],
  } as const;
  const [label, className] = map[status];
  return <span className={`status-badge ${className}`}>{status === "none" ? <CheckCircledIcon /> : null}{label}</span>;
}

function formatRange(start: string, end: string) {
  const format = (value: string) => new Intl.DateTimeFormat("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" }).format(new Date(value));
  return `${format(start)} ~ ${format(end)}`;
}
