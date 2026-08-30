"use client";

import { ReloadIcon } from "@radix-ui/react-icons";
import { isSessionError } from "@/lib/query/client";

type QueryState = { isPending: boolean; isFetching: boolean; isError: boolean; error: unknown; refetch: () => Promise<unknown> };

export function QueryFeedback({ queries, label }: { queries: QueryState[]; label: string }) {
  const fetching = queries.some((query) => query.isFetching);
  const failed = queries.some((query) => query.isError);
  const sessionExpired = queries.some((query) => isSessionError(query.error));
  return <div className="query-feedback">
    {failed ? <p role="alert">{sessionExpired ? "로그인 상태가 변경됐어요. 화면을 다시 열어 주세요." : "최신 정보를 불러오지 못했어요. 기존 정보가 있다면 그대로 표시합니다."}</p> : <p role="status">{fetching ? "최신 상태를 확인하고 있어요." : queries.some((query) => query.isPending) ? "연결을 기다리고 있어요." : "서버에서 조회한 정보입니다."}</p>}
    {sessionExpired ? <a className="button button-secondary button-small" href="/login">로그인 확인</a> : <button className="button button-quiet button-small" type="button" disabled={fetching} aria-label={`${label} 새로고침`} onClick={() => { void Promise.all(queries.map((query) => query.refetch())); }}><ReloadIcon aria-hidden="true" />새로고침</button>}
  </div>;
}
