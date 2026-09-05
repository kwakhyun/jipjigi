"use client";

import { Button, EmptyState, Field } from "@jipjigi/ui/components";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarIcon, CheckCircledIcon, ClockIcon, GearIcon, HomeIcon } from "@radix-ui/react-icons";
import type { MaintenanceRow } from "@/lib/data/types";
import { formatKoreanScheduleDateTime, relativeDayLabel } from "@/lib/format/date";
import { useTransientMessage } from "@/lib/hooks/use-transient-message";
import { ownerResourceOptions } from "@/lib/query/options";
import { useOwnerId } from "@/lib/query/owner-context";
import { useOperationMutation } from "@/lib/query/use-operation";
import { isSessionError } from "@/lib/query/client";
import { QueryFeedback } from "@/components/query-feedback";

export function MaintenanceView({
  referenceTime,
  initialScheduleId,
}: {
  referenceTime: string;
  initialScheduleId?: string;
}) {
  const maintenance = useQuery(ownerResourceOptions(useOwnerId(), "maintenance"));
  const requests = maintenance.data ?? [];
  const operation = useOperationMutation();
  const pendingId = operation.variables?.type === "update_maintenance" ? operation.variables.requestId : null;
  const [schedulingId, setSchedulingId] = useState(initialScheduleId ?? null);
  const [scheduleValue, setScheduleValue] = useState("");
  const isPending = operation.isPending;
  const [toast, showToast] = useTransientMessage();

  const completeRequest = async (request: MaintenanceRow) => {
    try {
      await operation.mutateAsync({ type: "update_maintenance", requestId: request.id, status: "completed" });
      showToast("수리 요청을 완료 처리했어요.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "상태를 변경하지 못했습니다.");
    }
  };

  const scheduleVisit = async (event: FormEvent<HTMLFormElement>, request: MaintenanceRow) => {
    event.preventDefault();
    if (!scheduleValue) return;
    try {
      const scheduledAt = new Date(`${scheduleValue}:00+09:00`).toISOString();
      await operation.mutateAsync({ type: "update_maintenance", requestId: request.id, status: "scheduled", scheduledAt });
      setSchedulingId(null);
      setScheduleValue("");
      showToast(`${formatKoreanScheduleDateTime(scheduledAt)} 방문으로 저장했어요.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "방문 일정을 저장하지 못했습니다.");
    }
  };

  const open = requests.filter((request) => request.status !== "completed");
  const completed = requests.filter((request) => request.status === "completed");
  if (!maintenance.data || isSessionError(maintenance.error)) return <QueryFeedback queries={[maintenance]} label="수리 요청" />;
  return (
    <>
      <QueryFeedback queries={[maintenance]} label="수리 요청" />
      <section className="maintenance-board">
        <div className="maintenance-column">
          <div className="column-heading"><span className="status-dot dot-coral" /><div><h2>처리 중</h2><p>처리할 요청이 {open.length}건 있어요.</p></div></div>
          {open.map((request) => (
            <article className="maintenance-card" key={request.id}>
              <div className="maintenance-card-top"><span className="status-badge status-upcoming">{request.status === "received" ? "새 요청" : "방문 예정"}</span><time dateTime={request.requestedAt}>{relativeDayLabel(request.requestedAt, referenceTime)}</time></div>
              <div className="maintenance-title"><span className="maintenance-icon"><GearIcon /></span><div><h3>{request.title}</h3><p><HomeIcon /> {request.buildingName} {request.unitName}</p></div></div>
              <p className="maintenance-description">{request.description}</p>
              <div className="maintenance-meta"><ClockIcon /><span>{request.status === "received" ? "방문 날짜와 시간을 정하면 임차인에게 일정을 공유할 수 있어요." : request.scheduledAt ? `${formatKoreanScheduleDateTime(request.scheduledAt)} 방문 예정` : "방문 일정이 등록됐어요."}</span></div>
              {schedulingId === request.id ? (
                <form className="maintenance-schedule-form" id={`schedule-${request.id}`} onSubmit={(event) => scheduleVisit(event, request)}>
                  <Field id={`schedule-at-${request.id}`} label="방문 날짜와 시간">
                  <input
                    id={`schedule-at-${request.id}`}
                    type="datetime-local"
                    value={scheduleValue}
                    min={minimumScheduleValue(new Date().toISOString())}
                    onChange={(event) => setScheduleValue(event.target.value)}
                    required
                    autoFocus
                  />
                  </Field>
                  <p>임차인과 협의한 시간을 입력해 주세요. 시간은 한국 표준시를 기준으로 저장됩니다.</p>
                  <div>
                    <button className="button button-quiet" type="button" disabled={isPending} onClick={() => { setSchedulingId(null); setScheduleValue(""); }}>취소</button>
                    <button className="button button-primary" type="submit" disabled={!scheduleValue || isPending}>{pendingId === request.id && isPending ? "저장 중…" : "방문 일정 저장"}</button>
                  </div>
                </form>
              ) : request.status === "received" ? (
                <button className="button button-primary button-wide" type="button" aria-expanded="false" aria-controls={`schedule-${request.id}`} disabled={isPending} onClick={() => { setSchedulingId(request.id); setScheduleValue(""); }}>방문 일정 정하기</button>
              ) : (
                <div className="maintenance-actions">
                  <Button variant="quiet" disabled={isPending || maintenance.isError} onClick={() => { setSchedulingId(request.id); setScheduleValue(request.scheduledAt ? minimumScheduleValue(request.scheduledAt) : ""); }}>방문 일정 변경</Button>
                  <Button variant="secondary" disabled={isPending || maintenance.isError} onClick={() => completeRequest(request)}>{pendingId === request.id && isPending ? "저장 중…" : "수리 완료 처리"}</Button>
                </div>
              )}
            </article>
          ))}
          {open.length === 0 ? <Empty label="처리 중인 요청이 없어요." /> : null}
        </div>
        <div className="maintenance-column">
          <div className="column-heading"><span className="status-dot dot-green" /><div><h2>완료</h2><p>완료된 요청과 처리 기록을 확인할 수 있어요.</p></div></div>
          {completed.map((request) => <article className="maintenance-card completed-card" key={request.id}><CheckCircledIcon className="completed-check" /><div><h3>{request.title}</h3><p>{request.buildingName} {request.unitName}</p><small>{request.completedAt ? `${relativeDayLabel(request.completedAt, referenceTime)} 완료` : "완료"}</small></div></article>)}
          {completed.length === 0 ? <Empty label="아직 완료된 요청이 없어요." /> : null}
        </div>
      </section>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </>
  );
}

function Empty({ label }: { label: string }) {
  return <EmptyState className="surface-card" title={label} description="처리 상태가 바뀌면 여기에 표시돼요." icon={<CheckCircledIcon />} />;
}

function minimumScheduleValue(referenceTime: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Seoul",
  }).formatToParts(new Date(referenceTime));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
