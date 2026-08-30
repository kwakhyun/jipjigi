import "server-only";

import type { ReactNode } from "react";
import { dehydrate, HydrationBoundary, type QueryKey } from "@tanstack/react-query";
import { createQueryClient } from "@/lib/query/client";

export function QueryHydration({ entries, children }: { entries: Array<{ queryKey: QueryKey; data: unknown }>; children: ReactNode }) {
  // Request-local only. Never share authenticated server data between requests.
  const client = createQueryClient();
  for (const entry of entries) client.setQueryData(entry.queryKey, entry.data);
  const state = dehydrate(client);
  client.clear();
  return <HydrationBoundary state={state}>{children}</HydrationBoundary>;
}
