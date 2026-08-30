"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserByEmail } from "@/lib/data/repository";
import { setSessionCookie } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/request";

const INVALID_PASSWORD_HASH = "$2b$10$DeJG5bLgtjnZUZjIwiEzc.BVI2AJ70GX2IPesuIlqbTMW6pbT5zV.";

const LoginSchema = z.object({
  email: z.string().email("이메일 형식을 확인해 주세요."),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
  next: z.string().optional(),
});

export type LoginState = { error?: string; fields?: { email: string } };

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", fields: { email: String(formData.get("email") ?? "") } };
  }

  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await rateLimit(`login:${forwarded}`, 10, 10 * 60_000)).allowed) {
    return { error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.", fields: { email: parsed.data.email } };
  }

  const user = await getUserByEmail(parsed.data.email);
  const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? INVALID_PASSWORD_HASH);
  if (!user || !valid) return { error: "이메일 또는 비밀번호가 올바르지 않습니다.", fields: { email: parsed.data.email } };

  await setSessionCookie({ userId: user.id, name: user.name, role: user.role });
  const requestedPath = parsed.data.next;
  const nextPath = user.role === "operator"
    ? requestedPath === "/app/settings" || requestedPath === "/app/growth" ? requestedPath : "/app/growth"
    : requestedPath === "/app/growth" || !(requestedPath === "/app" || requestedPath?.startsWith("/app/")) ? "/app" : requestedPath;
  redirect(nextPath);
}
