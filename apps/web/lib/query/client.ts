import { QueryClient } from "@tanstack/react-query";

export class QueryRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function isSessionError(error: unknown) {
  return error instanceof QueryRequestError && (error.status === 401 || error.status === 403);
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Server clients are request-local; do not leave GC timers behind after SSR.
        gcTime: typeof window === "undefined" ? Infinity : 5 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (count, error) => !(error instanceof QueryRequestError && error.status < 500) && count < 1,
      },
      // Never queue or automatically repeat a payment/message operation.
      mutations: { retry: 0, networkMode: "always" },
    },
  });
}
