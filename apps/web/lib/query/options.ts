import { queryOptions } from "@tanstack/react-query";
import { QueryRequestError } from "./client";
import { ownerKeys } from "./keys";
import type { BriefingResponse, OwnerResources } from "./resources";

async function fetchOwnerResponse<T>(url: string, ownerId: string, signal: AbortSignal): Promise<T & { ownerId: string }> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new QueryRequestError(response.status === 401 || response.status === 403 ? "로그인 상태를 다시 확인해 주세요." : "최신 정보를 불러오지 못했어요.", response.status);
  const body = await response.json() as T & { ownerId: string };
  // Another tab may have changed the cookie while this tab still has its old UI.
  if (body.ownerId !== ownerId) throw new QueryRequestError("계정이 변경됐어요. 화면을 다시 열어 주세요.", 401);
  return body;
}

export function ownerResourceOptions<Key extends keyof OwnerResources>(ownerId: string, resource: Key) {
  return queryOptions({
    queryKey: ownerKeys.resource(ownerId, resource),
    queryFn: async ({ signal }) => (await fetchOwnerResponse<{ data: OwnerResources[Key] }>(`/api/workspace/${resource}`, ownerId, signal)).data,
  });
}

export function briefingOptions(ownerId: string, buildingId: string) {
  return queryOptions({
    queryKey: ownerKeys.briefing(ownerId, buildingId),
    queryFn: ({ signal }) => fetchOwnerResponse<BriefingResponse>(`/api/mobile/v1/briefing?buildingId=${encodeURIComponent(buildingId)}`, ownerId, signal),
  });
}
