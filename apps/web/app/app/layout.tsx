import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/dal";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await requireSession();
  return <AppShell user={{ name: user.name, email: user.email, role: user.role }}>{children}</AppShell>;
}
