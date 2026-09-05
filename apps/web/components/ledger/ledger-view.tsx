"use client";

import { Button, EmptyState, StatusBadge } from "@jipjigi/ui/components";
import Link from "next/link";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircledIcon, ExclamationTriangleIcon, PaperPlaneIcon } from "@radix-ui/react-icons";
import { formatWon } from "@jipjigi/domain/format";
import type { LedgerRow } from "@/lib/data/types";
import { useTransientMessage } from "@/lib/hooks/use-transient-message";
import { ownerResourceOptions } from "@/lib/query/options";
import { useOwnerId } from "@/lib/query/owner-context";
import { useOperationMutation } from "@/lib/query/use-operation";
import { isSessionError } from "@/lib/query/client";
import { QueryFeedback } from "@/components/query-feedback";

type Filter = "all" | "paid" | "overdue";

export function LedgerView() {
  const ledger = useQuery(ownerResourceOptions(useOwnerId(), "ledger"));
  const rows = ledger.data ?? [];
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const periods = useMemo(() => [...new Set(rows.map((row) => row.period))].sort().reverse(), [rows]);
  const activePeriod = periods.includes(selectedPeriod) ? selectedPeriod : periods[0] ?? "";
  const periodRows = useMemo(() => rows.filter((row) => row.period === activePeriod), [rows, activePeriod]);
  const operation = useOperationMutation();
  const isPending = operation.isPending;
  const pendingId = operation.variables?.type === "mark_payment" ? operation.variables.chargeId : null;
  const [toast, showToast] = useTransientMessage();
  const visible = useMemo(() => filter === "all" ? periodRows : periodRows.filter((row) => row.status === filter), [filter, periodRows]);
  const totals = useMemo(() => periodRows.reduce(
    (current, row) => {
      current.expected += row.amount;
      if (row.status === "paid") current.collected += row.amount;
      if (row.status === "overdue") {
        current.overdue += row.amount;
        current.overdueCount += 1;
      }
      return current;
    },
    { expected: 0, collected: 0, overdue: 0, overdueCount: 0 },
  ), [periodRows]);

  const run = async (row: LedgerRow) => {
    try {
      await operation.mutateAsync({ type: "mark_payment", chargeId: row.id });
      showToast(`${row.unitName}의 입금을 확인하고 납부 완료로 반영했어요.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "작업을 처리하지 못했습니다.");
    }
  };

  if (!ledger.data || isSessionError(ledger.error)) return <QueryFeedback queries={[ledger]} label="임대 장부" />;
  return (
    <>
      <QueryFeedback queries={[ledger]} label="임대 장부" />
      <section className="summary-grid ledger-summary" aria-label="선택한 청구월 임대료 요약">
        <article className="summary-card"><span>청구액</span><strong>{formatWon(totals.expected)}</strong><small>{periodRows.length}건 청구</small></article>
        <article className="summary-card summary-positive"><span>수납 완료</span><strong>{formatWon(totals.collected)}</strong><small>{totals.expected ? Math.round((totals.collected / totals.expected) * 100) : 0}% 수납</small></article>
        <article className="summary-card summary-warning"><span>미납</span><strong>{formatWon(totals.overdue)}</strong><Button variant="quiet" size="small" onClick={() => { setFilter("overdue"); document.getElementById("ledger-list-title")?.scrollIntoView({ block: "start" }); }}>미납 {totals.overdueCount}건 보기</Button></article>
      </section>
      <section className="surface-card data-section ledger-section" aria-labelledby="ledger-list-title">
        <div className="data-section-header">
          <div><h2 id="ledger-list-title">{activePeriod ? `${activePeriod.slice(0, 4)}년 ${Number(activePeriod.slice(5))}월 임대료` : "임대료 청구 내역"}</h2><p>입금 상태를 확인하고 필요한 조치를 바로 실행하세요.</p></div>
          {periods.length > 1 ? <label className="ledger-period-select"><span className="sr-only">청구월 선택</span><select aria-label="청구월 선택" value={activePeriod} onChange={(event) => setSelectedPeriod(event.target.value)}>{periods.map((period) => <option key={period} value={period}>{period}</option>)}</select></label> : null}
          <div className="segmented-control" aria-label="납부 상태 필터">
            {(["all", "paid", "overdue"] as const).map((value) => (
              <button key={value} type="button" className={filter === value ? "is-selected" : ""} onClick={() => setFilter(value)} aria-pressed={filter === value}>
                {value === "all" ? "전체" : value === "paid" ? "납부 완료" : "미납"}
              </button>
            ))}
          </div>
        </div>
        <div className="table-scroll ledger-scroll">
          <table className="data-table ledger-table">
            <thead><tr><th>건물·호실</th><th>임차인</th><th>납부 기한</th><th>금액</th><th>상태</th><th><span className="sr-only">작업</span></th></tr></thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.unitName}</strong><small>{row.buildingName}</small></td>
                  <td data-label="임차인">{row.tenantName}</td>
                  <td data-label="납부 기한">{formatDate(row.dueDate)}</td>
                  <td data-label="금액" className="money-cell">{formatWon(row.amount)}</td>
                  <td data-label="상태"><Status status={row.status} /></td>
                  <td className="action-cell">
                    {row.status === "overdue" ? (
                      <div className="row-actions">
                        <Link className="button button-quiet button-small" href={`/app/messages?target=${encodeURIComponent(row.id)}`}><PaperPlaneIcon /> 미납 안내 확인</Link>
                        <Button variant="secondary" size="small" disabled={isPending || ledger.isError} onClick={() => run(row)}>{pendingId === row.id && isPending ? "확인 중…" : "입금 확인"}</Button>
                      </div>
                    ) : <span className="muted-caption">{row.paidAt ? formatDate(row.paidAt) : "-"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visible.length === 0 ? <EmptyState title="이 상태의 항목이 없어요." icon={<CheckCircledIcon />} /> : null}
      </section>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </>
  );
}

function Status({ status }: { status: LedgerRow["status"] }) {
  const label = status === "paid" ? "납부 완료" : status === "overdue" ? "미납" : "납부 예정";
  return <StatusBadge tone={status === "paid" ? "positive" : status === "overdue" ? "warning" : "neutral"}>{status === "paid" ? <CheckCircledIcon /> : status === "overdue" ? <ExclamationTriangleIcon /> : null}{label}</StatusBadge>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(value));
}
