"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircledIcon, ExclamationTriangleIcon, PaperPlaneIcon } from "@radix-ui/react-icons";
import { formatWon } from "@jipjigi/domain/format";
import type { LedgerRow } from "@/lib/data/repository";
import { useTransientMessage } from "@/lib/hooks/use-transient-message";
import { submitOperation } from "@/lib/operations/client";

type Filter = "all" | "paid" | "overdue";

export function LedgerView({ initialRows }: { initialRows: LedgerRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState<Filter>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [toast, showToast] = useTransientMessage();
  const visible = useMemo(() => filter === "all" ? rows : rows.filter((row) => row.status === filter), [filter, rows]);
  const totals = useMemo(() => rows.reduce(
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
  ), [rows]);

  const run = (row: LedgerRow, type: "mark_payment" | "send_overdue_notice") => {
    setPendingId(row.id);
    startTransition(async () => {
      try {
        if (type === "mark_payment") {
          await submitOperation({ type: "mark_payment", chargeId: row.id });
          setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: "paid", paidAt: new Date().toISOString() } : item));
          showToast(`${row.unitName}의 입금을 확인하고 납부 완료로 반영했어요.`);
        } else {
          const result = await submitOperation({ type: "send_overdue_notice", chargeId: row.id });
          showToast("id" in result && result.status === "blocked" ? `${row.unitName}은 발송 조건을 충족하지 못해 안내를 차단했어요.` : "duplicate" in result && result.duplicate ? `${row.unitName}에는 이번 청구월 안내가 이미 접수돼 있어요.` : `${row.unitName} 미납 안내를 접수했어요.`);
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : "작업을 처리하지 못했습니다.");
      } finally {
        setPendingId(null);
      }
    });
  };

  return (
    <>
      <section className="summary-grid" aria-label="이달 임대료 요약">
        <article className="summary-card"><span>청구액</span><strong>{formatWon(totals.expected)}</strong><small>{rows.length}건 청구</small></article>
        <article className="summary-card summary-positive"><span>수납 완료</span><strong>{formatWon(totals.collected)}</strong><small>{totals.expected ? Math.round((totals.collected / totals.expected) * 100) : 0}% 수납</small></article>
        <article className="summary-card summary-warning"><span>미납</span><strong>{formatWon(totals.overdue)}</strong><small>{totals.overdueCount}건 확인 필요</small></article>
      </section>
      <section className="surface-card data-section" aria-labelledby="ledger-list-title">
        <div className="data-section-header">
          <div><h2 id="ledger-list-title">2026년 8월 임대료</h2><p>입금 상태를 확인하고 필요한 조치를 바로 실행하세요.</p></div>
          <div className="segmented-control" aria-label="납부 상태 필터">
            {(["all", "paid", "overdue"] as const).map((value) => (
              <button key={value} type="button" className={filter === value ? "is-selected" : ""} onClick={() => setFilter(value)} aria-pressed={filter === value}>
                {value === "all" ? "전체" : value === "paid" ? "납부 완료" : "미납"}
              </button>
            ))}
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>건물·호실</th><th>임차인</th><th>납부 기한</th><th>금액</th><th>상태</th><th><span className="sr-only">작업</span></th></tr></thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.unitName}</strong><small>{row.buildingName}</small></td>
                  <td>{row.tenantName}</td>
                  <td>{formatDate(row.dueDate)}</td>
                  <td className="money-cell">{formatWon(row.amount)}</td>
                  <td><Status status={row.status} /></td>
                  <td className="action-cell">
                    {row.status === "overdue" ? (
                      <div className="row-actions">
                        <button className="button button-quiet button-small" type="button" disabled={isPending} onClick={() => run(row, "send_overdue_notice")}><PaperPlaneIcon /> {pendingId === row.id && isPending ? "접수 중…" : "미납 안내"}</button>
                        <button className="button button-secondary button-small" type="button" disabled={isPending} onClick={() => run(row, "mark_payment")}>{pendingId === row.id && isPending ? "확인 중…" : "입금 확인"}</button>
                      </div>
                    ) : <span className="muted-caption">{row.paidAt ? formatDate(row.paidAt) : "-"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visible.length === 0 ? <div className="empty-state"><CheckCircledIcon /><strong>이 상태의 항목이 없어요.</strong></div> : null}
      </section>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </>
  );
}

function Status({ status }: { status: LedgerRow["status"] }) {
  const label = status === "paid" ? "납부 완료" : status === "overdue" ? "미납" : "납부 예정";
  return <span className={`status-badge status-${status}`}>{status === "paid" ? <CheckCircledIcon /> : status === "overdue" ? <ExclamationTriangleIcon /> : null}{label}</span>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(value));
}
