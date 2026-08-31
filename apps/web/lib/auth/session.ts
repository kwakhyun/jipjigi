import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { SESSION_COOKIE } from "./constants";

const SESSION_DURATION_SECONDS = 60 * 60 * 12;
export const DEMO_WORKSPACE_COOKIE = "jipjigi_demo_workspace";

export { SESSION_COOKIE } from "./constants";

export type SessionPayload = {
  userId: string;
  name: string;
  role: "owner" | "operator";
};

function authSecret() {
  const value = process.env.AUTH_SECRET;
  if (value && value.length >= 32) return new TextEncoder().encode(value);
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be at least 32 characters in production");
  }
  return new TextEncoder().encode("jipjigi-local-development-secret-2026");
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(authSecret());
}

export async function readSessionToken(token?: string | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret(), { algorithms: ["HS256"] });
    if (
      typeof payload.userId !== "string" ||
      typeof payload.name !== "string" ||
      (payload.role !== "owner" && payload.role !== "operator")
    ) {
      return null;
    }
    return { userId: payload.userId, name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function createDemoWorkspaceToken(workspaceId: string, expiresAt: string) {
  return new SignJWT({ workspaceId })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("jipjigi-demo-workspace")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.parse(expiresAt) / 1000))
    .sign(authSecret());
}

export async function readDemoWorkspaceToken(token?: string | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret(), { algorithms: ["HS256"], audience: "jipjigi-demo-workspace" });
    return typeof payload.workspaceId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.workspaceId)
      ? payload.workspaceId : null;
  } catch {
    return null;
  }
}

export async function savedDemoWorkspaceId() {
  const store = await cookies();
  return readDemoWorkspaceToken(store.get(DEMO_WORKSPACE_COOKIE)?.value);
}

export async function setDemoWorkspaceCookie(workspaceId: string, expiresAt: string) {
  const store = await cookies();
  store.set(DEMO_WORKSPACE_COOKIE, await createDemoWorkspaceToken(workspaceId, expiresAt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(expiresAt),
    path: "/",
  });
}
