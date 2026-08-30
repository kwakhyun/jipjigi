"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircledIcon, ClockIcon, InfoCircledIcon, LockClosedIcon, PaperPlaneIcon } from "@radix-ui/react-icons";
import type { MessageDispatchOperationResult } from "@jipjigi/domain";
import type { ContractRow, LedgerRow, MessageRow } from "@/lib/data/repository";
import { useTransientMessage } from "@/lib/hooks/use-transient-message";
import { submitOperation } from "@/lib/operations/client";

type Target = { kind: "charge" | "lease"; id: string; label: string; recipient: string; template: string };

async function sendTarget(target: Target): Promise<MessageDispatchOperationResult> {
  const result = target.kind === "charge"
    ? await submitOperation({ type: "send_overdue_notice", chargeId: target.id })
    : await submitOperation({ type: "start_renewal", leaseId: target.id });
  if (!("id" in result)) throw new Error("메시지 접수 결과를 확인하지 못했습니다.");
  return result;
}

export function MessagesView({ initialMessages, contracts, charges, initialTargetId, quietHours }: { initialMessages: MessageRow[]; contracts: ContractRow[]; charges: LedgerRow[]; initialTargetId?: string | undefined; quietHours: { start: string; end: string } }) {
  const targets = useMemo<Target[]>(() => [
    ...charges.filter((charge) => charge.status === "overdue").map((charge) => ({ kind: "charge" as const, id: charge.id, label: `${charge.unitName} 미납 안내`, recipient: charge.tenantName, template: `${charge.tenantName}님, ${charge.unitName}의 이번 달 임대료 입금 내역이 아직 확인되지 않아 안내드립니다. 이미 납부하셨다면 별도로 답변하지 않으셔도 됩니다.` })),
    ...contracts.filter((contract) => contract.renewalStatus === "attention").map((contract) => ({ kind: "lease" as const, id: contract.id, label: `${contract.unitName} 갱신 의사 확인`, recipient: contract.tenantName, template: `${contract.tenantName}님, 계약 만료일이 다가와 갱신 의사를 여쭙습니다. 편하실 때 답변 부탁드립니다.` })),
  ], [charges, contracts]);
  const [selectedId, setSelectedId] = useState(() => initialTargetId ?? targets[0]?.id ?? "");
  const [messages, setMessages] = useState(initialMessages);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [toast, showToast] = useTransientMessage(3_000);
  const selected = targets.find((target) => target.id === selectedId);

  const send = () => {
    if (!selected) return;
    startTransition(async () => {
      try {
        const result = await sendTarget(selected);
        const nextMessage: MessageRow = {
          id: result.id,
          entityType: selected.kind,
          entityId: selected.id,
          channel: "sandbox_alimtalk",
          templateKey: selected.kind === "charge" ? "overdue_notice_v1" : "renewal_check_v1",
          status: result.status,
          guardrailReason: result.guardrailReason,
          scheduledFor: result.scheduledFor,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deliveredAt: null,
          retryCount: result.retryCount,
        };
        setMessages((current) => {
          if (result.duplicate) return current.some((message) => message.id === result.id) ? current : [nextMessage, ...current];
          return [nextMessage, ...current.filter((message) => message.id !== result.id)];
        });
        showToast(result.duplicate ? "같은 대상에 접수된 기존 메시지를 보여드려요." : result.status === "scheduled" ? "현재는 발송 제한 시간이라 다음 발송 가능 시간으로 예약했어요." : result.status === "blocked" ? "발송 제한 기준에 따라 메시지를 차단했어요." : "테스트 메시지를 접수했어요.");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "메시지를 접수하지 못했습니다.");
      }
    });
  };

  const retry = (message: MessageRow) => {
    setRetryingId(message.id);
    startTransition(async () => {
      try {
        const result = await submitOperation({ type: "retry_message", messageId: message.id });
        if (!("id" in result)) throw new Error("재접수 결과를 확인하지 못했습니다.");
        setMessages((current) => current.map((item) => item.id === message.id ? {
          ...item,
          status: result.status,
          guardrailReason: result.guardrailReason,
          scheduledFor: result.scheduledFor,
          updatedAt: new Date().toISOString(),
          retryCount: result.retryCount,
        } : item));
        showToast(result.status === "scheduled" ? "발송 가능 시간으로 다시 예약했어요." : result.status === "blocked" ? "현재 발송 조건을 충족하지 못해 차단했어요." : "실패한 메시지를 다시 접수했어요.");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "메시지를 다시 접수하지 못했습니다.");
      } finally {
        setRetryingId(null);
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
            {!selected ? <option value={selectedId} disabled>발송 가능한 대상을 선택해 주세요</option> : null}
            {targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
          </select>
          {selected ? (
            <div className="message-preview">
              <span className="message-preview-channel">집지기 알림</span>
              <strong>{selected.recipient}님께 보낼 내용</strong>
              <p>{selected.template}</p>
              <small>안내 수신을 원하지 않으면 메시지의 문의 경로에서 요청할 수 있습니다.</small>
            </div>
          ) : <div className="empty-state"><CheckCircledIcon /><strong>선택한 대상에 보낼 메시지가 없어요.</strong><span>이미 접수했거나 상태가 바뀌었을 수 있어요. 발송함을 확인하거나 다른 대상을 선택해 주세요.</span></div>}
          <div className="guardrail-checklist" aria-label="발송 전 자동 점검">
            <span><CheckCircledIcon /> 수신 동의 확인</span>
            <span><ClockIcon /> 발송 제한 {quietHours.start}~{quietHours.end} (한국 시간)</span>
            <span><LockClosedIcon /> 갱신은 24시간 1회, 미납은 청구월 1회</span>
          </div>
          <button className="button button-primary button-wide" type="button" disabled={!selected || isPending} onClick={send}><PaperPlaneIcon /> {isPending ? "발송 조건 확인 중…" : "발송 조건 확인 후 접수"}</button>
          <p className="sandbox-disclaimer"><InfoCircledIcon /> 실제 알림톡은 발송하지 않습니다. 예약은 시각과 상태 저장까지만 제공하며 자동 발송은 실행되지 않습니다. 실제 운영에는 공급자 연동과 예약 처리 워커가 필요합니다.</p>
        </section>
        <section className="surface-card outbox-card" aria-labelledby="outbox-title">
          <div className="data-section-header"><div><h2 id="outbox-title">발송함</h2><p>접수, 예약, 전달 결과를 한곳에서 확인합니다.</p></div><span className="count-badge">{messages.length}</span></div>
          <div className="outbox-list">
            {messages.map((message) => (
              <article className="outbox-row" key={message.id}>
                <span className={`channel-icon status-${message.status}`}><PaperPlaneIcon /></span>
                <div><strong>{templateLabel(message.templateKey)}</strong><p>{message.channel === "sandbox_alimtalk" ? "샌드박스 알림톡" : "앱 푸시"} · {message.entityId.replace(/^(charge|lease)-/, "")}</p><time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time></div>
                <div className="outbox-status-actions"><MessageStatus message={message} />{message.status === "failed" ? <button className="button button-secondary button-small" type="button" disabled={isPending} onClick={() => retry(message)}>{retryingId === message.id ? "재접수 중…" : "다시 접수"}</button> : null}</div>
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
  return <span className={`status-badge status-${message.status}`} title={message.guardrailReason ?? undefined}>{labels[message.status]}{message.retryCount ? ` · ${message.retryCount}차 재접수` : ""}</span>;
}

function templateLabel(key: string) {
  return key === "overdue_notice_v1" ? "정중한 미납 안내" : "계약 갱신 의사 확인";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(value));
}
