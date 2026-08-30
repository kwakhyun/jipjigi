"use client";

import { Suspense, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/lib/query/client";
import { OwnerContext } from "@/lib/query/owner-context";

export function Providers({ children, ownerId }: { children: ReactNode; ownerId: string }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <OwnerContext.Provider value={ownerId}>
      <QueryClientProvider client={queryClient}><Suspense fallback={<p role="status">운영 화면을 준비하고 있어요.</p>}>{children}</Suspense></QueryClientProvider>
    </OwnerContext.Provider>
  );
}
