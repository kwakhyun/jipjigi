import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/dal";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await requireSession();
  const demoEnabled = process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_AUTH === "true";
  return <AppShell key={user.id} user={{ name: user.name, email: user.email, role: user.role }} demoEnabled={demoEnabled} demoVariant={user.demoWorkspace?.variant ?? null}>{children}</AppShell>;
}
