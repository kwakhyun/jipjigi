"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircledIcon, ClockIcon, InfoCircledIcon, LockClosedIcon, PaperPlaneIcon } from "@radix-ui/react-icons";
import type { MessageDispatchOperationResult } from "@rentflow/domain";
import type { ContractRow, LedgerRow, MessageRow } from "@/lib/data/repository";
import { track } from "@/lib/analytics/client";
import { useTransientMessage } from "@/lib/hooks/use-transient-message";
import { submitOperation } from "@/lib/operations/client";

type Target = { kind: "charge" | "lease"; id: string; label: string; recipient: string; template: string };

async function sendTarget(target: Target): Promise<MessageDispatchOperationResult> {
  const result = target.kind === "charge"
    ? await submitOperation({ type: "send_overdue_notice", chargeId: target.id, idempotencyKey: crypto.randomUUID() })
    : await submitOperation({ type: "start_renewal", leaseId: target.id, idempotencyKey: crypto.randomUUID() });
  if (!("id" in result)) throw new Error("메시지 접수 결과를 확인하지 못했습니다.");
  return result;
}

export function MessagesView({ initialMessages, contracts, charges }: { initialMessages: MessageRow[]; contracts: ContractRow[]; charges: LedgerRow[] }) {
  const targets = useMemo<Target[]>(() => [
    ...charges.filter((charge) => charge.status === "overdue").map((charge) => ({ kind: "charge" as const, id: charge.id, label: `${charge.unitName} 미납 안내`, recipient: charge.tenantName, template: `${charge.tenantName}님, ${charge.unitName}의 이번 달 임대료 입금 내역이 아직 확인되지 않아 안내드립니다. 이미 납부하셨다면 별도로 답변하지 않으셔도 됩니다.` })),
    ...contracts.filter((contract) => contract.renewalStatus === "attention").map((contract) => ({ kind: "lease" as const, id: contract.id, label: `${contract.unitName} 갱신 의사 확인`, recipient: contract.tenantName, template: `${contract.tenantName}님, 계약 만료일이 다가와 갱신 의사를 여쭙습니다. 편하실 때 답변 부탁드립니다.` })),
  ], [charges, contracts]);
  const [selectedId, setSelectedId] = useState(targets[0]?.id ?? "");
  const [messages, setMessages] = useState(initialMessages);
  const [isPending, startTransition] = useTransition();
  const [toast, showToast] = useTransientMessage(3_000);
  const selected = targets.find((target) => target.id === selectedId) ?? targets[0];

  const send = () => {
    if (!selected) return;
    startTransition(async () => {
      try {
        const result = await sendTarget(selected);
        setMessages((current) => [{
          id: result.id,
          entityType: selected.kind,
          entityId: selected.id,
          channel: "sandbox_alimtalk",
          templateKey: selected.kind === "charge" ? "overdue_notice_v1" : "renewal_check_v1",
          status: result.status,
          guardrailReason: result.guardrailReason,
          scheduledFor: result.scheduledFor,
          createdAt: new Date().toISOString(),
        }, ...current]);
        track("crm_message_dispatched", { channel: "sandbox_alimtalk", outcome: result.status, [selected.kind === "charge" ? "charge_id" : "lease_id"]: selected.id });
        showToast(result.status === "scheduled" ? "현재는 발송 제한 시간이라 다음 발송 가능 시간으로 예약했어요." : result.status === "blocked" ? "발송 제한 기준에 따라 메시지를 차단했어요." : "테스트 메시지를 접수했어요.");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "메시지를 접수하지 못했습니다.");
      }
    });
  };

  return (
    <>
      <div className="messages-layout">
        <section className="surface-card composer-card" aria-labelledby="composer-title">
          <div className="composer-heading"><div><span className="section-kicker" aria-hidden="true">샌드박스 채널</span><h2 id="composer-title">안전한 메시지 보내기</h2></div><span className="sandbox-badge">테스트 채널</span></div>
          <label className="field-label" htmlFor="message-target">대상과 목적</label>
          <select className="text-input select-input" id="message-target" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
          </select>
          {selected ? (
            <div className="message-preview">
              <span className="message-preview-channel">렌트플로우 알림</span>
              <strong>{selected.recipient}님께 보낼 내용</strong>
              <p>{selected.template}</p>
              <small>수신 거부는 앱 설정에서 변경할 수 있습니다.</small>
            </div>
          ) : <div className="empty-state"><CheckCircledIcon /><strong>지금 보낼 메시지가 없어요.</strong></div>}
          <div className="guardrail-checklist" aria-label="발송 전 자동 점검">
            <span><CheckCircledIcon /> 수신 동의 확인</span>
            <span><ClockIcon /> 오후 9시부터 오전 8시까지 예약</span>
            <span><LockClosedIcon /> 최근 7일간 최대 2회</span>
          </div>
          <button className="button button-primary button-wide" type="button" disabled={!selected || isPending} onClick={send}><PaperPlaneIcon /> {isPending ? "발송 조건 확인 중…" : "발송 조건 확인 후 접수"}</button>
          <p className="sandbox-disclaimer"><InfoCircledIcon /> 이 포트폴리오 환경에서는 실제 알림톡을 보내지 않습니다. 실제 서비스에서는 공급자 연동만 교체해 같은 계약과 상태 데이터를 사용할 수 있습니다.</p>
        </section>
        <section className="surface-card outbox-card" aria-labelledby="outbox-title">
          <div className="data-section-header"><div><h2 id="outbox-title">발송함</h2><p>접수, 예약, 전달 결과를 한곳에서 확인합니다.</p></div><span className="count-badge">{messages.length}</span></div>
          <div className="outbox-list">
            {messages.map((message) => (
              <article className="outbox-row" key={message.id}>
                <span className={`channel-icon status-${message.status}`}><PaperPlaneIcon /></span>
                <div><strong>{templateLabel(message.templateKey)}</strong><p>{message.channel === "sandbox_alimtalk" ? "샌드박스 알림톡" : "앱 푸시"} · {message.entityId.replace(/^(charge|lease)-/, "")}</p><time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time></div>
                <MessageStatus message={message} />
              </article>
            ))}
            {messages.length === 0 ? <div className="empty-state"><PaperPlaneIcon /><strong>아직 발송 이력이 없어요.</strong><span>첫 메시지를 접수하면 발송 상태가 여기에 표시됩니다.</span></div> : null}
          </div>
        </section>
      </div>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </>
  );
}

function MessageStatus({ message }: { message: MessageRow }) {
  const labels: Record<MessageRow["status"], string> = { accepted: "접수", scheduled: "예약", delivered: "전달", blocked: "차단", failed: "실패" };
  return <span className={`status-badge status-${message.status}`} title={message.guardrailReason ?? undefined}>{labels[message.status]}</span>;
}

function templateLabel(key: string) {
  return key === "overdue_notice_v1" ? "정중한 미납 안내" : "계약 갱신 의사 확인";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(value));
}
