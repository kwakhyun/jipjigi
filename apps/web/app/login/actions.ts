"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { z } from "zod";
import { getUserByEmail } from "@/lib/data/repository";
import { clearSessionCookie, savedDemoWorkspaceId, setDemoWorkspaceCookie, setSessionCookie } from "@/lib/auth/session";
import { postLoginPath } from "@/lib/auth/navigation";
import { demoEnabled, DemoWorkspaceError, enterDemoWorkspace, isDemoCredential } from "@/lib/demo/workspace";
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

  let userId = user.id;
  if (isDemoCredential(user.id)) {
    if (!demoEnabled()) return { error: "현재 데모 로그인을 제공하지 않습니다." };
    try {
      const workspace = await enterDemoWorkspace(await savedDemoWorkspaceId());
      userId = user.role === "owner" ? workspace.ownerId : workspace.operatorId;
      await setDemoWorkspaceCookie(workspace.id, workspace.expiresAt);
    } catch (error) {
      if (error instanceof DemoWorkspaceError) return { error: error.message };
      throw error;
    }
  }
  await setSessionCookie({ userId, name: user.name, role: user.role });
  revalidatePath("/app", "layout");
  redirect(postLoginPath(user.role, parsed.data.next), RedirectType.replace);
}

export async function logoutAction(formData: FormData) {
  await clearSessionCookie();
  revalidatePath("/app", "layout");
  const mode = formData.get("mode");
  // Keep the signed workspace cookie so the other role sees this visitor's work.
  const destination = demoEnabled() && (mode === "owner" || mode === "operator") ? `/login?mode=${mode}` : "/login";
  redirect(destination, RedirectType.replace);
}
