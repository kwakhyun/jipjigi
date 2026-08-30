import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDatabase } from "@/lib/db/client";
import { readSessionToken, SESSION_COOKIE, type SessionPayload } from "./session";

const getTokenSession = cache(async () => {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
});

async function currentUser(session: SessionPayload) {
  const database = await getDatabase();
  return database
    .prepare("SELECT id, email, name, role FROM users WHERE id = ?")
    .get<{ id: string; email: string; name: string; role: SessionPayload["role"] }>(session.userId);
}

export const getOptionalSession = cache(async () => {
  const session = await getTokenSession();
  if (!session) return null;
  const user = await currentUser(session);
  if (!user) return null;
  return { userId: user.id, email: user.email, name: user.name, role: user.role };
});

export const requireSession = cache(async () => {
  const user = await getOptionalSession();
  if (!user) redirect("/login");
  return { id: user.userId, email: user.email, name: user.name, role: user.role };
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
