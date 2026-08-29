import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDatabase } from "@/lib/db/client";
import { readSessionToken, SESSION_COOKIE, type SessionPayload } from "./session";

export const getOptionalSession = cache(async () => {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
});

export const requireSession = cache(async () => {
  const session = await getOptionalSession();
  if (!session) redirect("/login");

  const user = getDatabase()
    .prepare("SELECT id, email, name, role FROM users WHERE id = ?")
    .get(session.userId) as { id: string; email: string; name: string; role: SessionPayload["role"] } | undefined;

  if (!user) redirect("/login");
  return user;
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
  return readSessionToken(match ? decodeURIComponent(match[1] ?? "") : null);
}
