"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect, RedirectType } from "next/navigation";
import { getOptionalSession } from "@/lib/auth/dal";
import { roleHome } from "@/lib/auth/navigation";
import { savedDemoWorkspaceId, setDemoWorkspaceCookie, setSessionCookie } from "@/lib/auth/session";
import { demoEnabled, DemoWorkspaceError, restartDemoWorkspace } from "@/lib/demo/workspace";
import { rateLimit } from "@/lib/security/request";

export type DemoRestartState = { error?: string };

export async function restartDemoAction(_state: DemoRestartState, formData: FormData): Promise<DemoRestartState> {
  const [user, savedId] = await Promise.all([getOptionalSession(), savedDemoWorkspaceId()]);
  if (!demoEnabled() || !user?.demoWorkspace || savedId !== user.demoWorkspace.id) {
    return { error: "데모 세션을 확인할 수 없어요. 다시 로그인해 주세요." };
  }
  const variant = formData.get("variant");
  if (variant !== "risk-first" && variant !== "agenda-first") return { error: "체험할 홈 구성을 선택해 주세요." };
  if (formData.get("confirm") !== "yes") return { error: "현재 체험 내용을 초기화하는 데 동의해 주세요." };
  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await rateLimit(`demo-restart:${forwarded}`, 3, 60_000)).allowed) return { error: "새로 시작 요청이 많아요. 1분 뒤 다시 시도해 주세요." };

  try {
    const workspace = await restartDemoWorkspace(savedId, user.userId, variant);
    await setDemoWorkspaceCookie(workspace.id, workspace.expiresAt);
    await setSessionCookie({ userId: user.role === "owner" ? workspace.ownerId : workspace.operatorId, name: user.name, role: user.role });
  } catch (error) {
    if (error instanceof DemoWorkspaceError) return { error: error.message };
    throw error;
  }
  revalidatePath("/app", "layout");
  redirect(roleHome(user.role), RedirectType.replace);
}
