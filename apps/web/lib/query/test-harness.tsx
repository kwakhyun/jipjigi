import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "jotai";
import { createQueryClient } from "./client";
import { ownerKeys } from "./keys";
import { OwnerContext } from "./owner-context";
import type { OwnerResources } from "./resources";

export function ownerQueryHarness(resources: Partial<OwnerResources> = {}, ownerId = "owner-1") {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { staleTime: 30_000, gcTime: Infinity, retry: false }, mutations: { retry: false } });
  for (const [key, data] of Object.entries(resources)) client.setQueryData(ownerKeys.resource(ownerId, key), data);
  function Wrapper({ children }: { children: ReactNode }) {
    return <Provider><OwnerContext.Provider value={ownerId}><QueryClientProvider client={client}>{children}</QueryClientProvider></OwnerContext.Provider></Provider>;
  }
  const fetch = async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const resource = url.split("/").at(-1) as keyof OwnerResources;
    return Response.json({ ownerId, data: resources[resource] });
  };
  return { client, Wrapper, resources, fetch };
}
