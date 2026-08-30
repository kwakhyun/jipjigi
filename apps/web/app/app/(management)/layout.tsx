import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { requireSession } from "@/lib/auth/dal";

export default async function ManagementLayout({ children }: { children: ReactNode }) {
  const user = await requireSession();
  // Settings is shared with operators, but only owner forms use the data cache.
  return user.role === "owner" ? <Providers key={user.id} ownerId={user.id}>{children}</Providers> : children;
}
