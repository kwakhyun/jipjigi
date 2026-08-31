import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDatabase } from "@/lib/db/client";
import { demoEnabled, isDemoCredential, type DemoWorkspace } from "@/lib/demo/workspace";
import { readSessionToken, SESSION_COOKIE, type SessionPayload } from "./session";

const getTokenSession = cache(async () => {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
});

async function currentUser(session: SessionPayload) {
  const database = await getDatabase();
  const row = await database.prepare(`SELECT u.id, u.email, u.name, u.role,
    w.id AS workspaceId, w.owner_id AS ownerId, w.operator_id AS operatorId,
    w.variant, w.created_at AS createdAt, w.expires_at AS expiresAt
    FROM users u LEFT JOIN demo_workspaces w ON u.id = w.owner_id OR u.id = w.operator_id
    WHERE u.id = ?`).get<{
      id: string; email: string; name: string; role: SessionPayload["role"];
      workspaceId: string | null; ownerId: string; operatorId: string;
      variant: DemoWorkspace["variant"]; createdAt: string; expiresAt: string;
    }>(session.userId);
  // Previously issued shared-account sessions must log in to obtain an isolated
  // workspace. They must never access the aggregate of all new demo visitors.
  if (!row || isDemoCredential(row.id)) return null;
  if (row.workspaceId && (!demoEnabled() || Date.parse(row.expiresAt) <= Date.now())) return null;
  return {
    id: row.id, name: row.name, role: row.role,
    email: row.workspaceId ? row.role === "owner" ? "demo@jipjigi.kr" : "growth@jipjigi.kr" : row.email,
    demoWorkspace: row.workspaceId ? {
      id: row.workspaceId, ownerId: row.ownerId, operatorId: row.operatorId,
      variant: row.variant, createdAt: row.createdAt, expiresAt: row.expiresAt,
    } satisfies DemoWorkspace : null,
  };
}

export const getOptionalSession = cache(async () => {
  const session = await getTokenSession();
  if (!session) return null;
  const user = await currentUser(session);
  if (!user) return null;
  return { userId: user.id, email: user.email, name: user.name, role: user.role, demoWorkspace: user.demoWorkspace };
});

export const requireSession = cache(async () => {
  const user = await getOptionalSession();
  if (!user) redirect("/login");
  return { id: user.userId, email: user.email, name: user.name, role: user.role, demoWorkspace: user.demoWorkspace };
});

export const requireOwner = cache(async () => {
  const user = await requireSession();
  if (user.role !== "owner") notFound();
  return user;
});

export const requireOperator = cache(async () => {
  const user = await requireSession();
  if (user.role !== "operator") notFound();
  return user;
});

export async function sessionFromRequest(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  const session = await readSessionToken(match ? decodeURIComponent(match[1] ?? "") : null);
  if (!session) return null;

  const user = await currentUser(session);

  if (!user) return null;
  return { userId: user.id, name: user.name, role: user.role } satisfies SessionPayload;
}
